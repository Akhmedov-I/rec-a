import { NextRequest, NextResponse } from 'next/server';

// Allow up to 5 minutes for Gemini to generate 30 questions
export const maxDuration = 300;

const MODELS = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { candidateName, position, description } = body;

    if (!candidateName || !position) {
      return NextResponse.json({ error: 'candidateName and position required' }, { status: 400 });
    }
    const API_KEY = process.env.GEMINI_API_KEY || '';
    if (!API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });
    }

    const prompt = buildPrompt(candidateName, position, description || '');

    let lastError = 'All models failed';
    for (const model of MODELS) {
      const result = await tryModel(model, prompt, API_KEY);
      if (result.text) {
        const parsed = extractJSON(result.text);
        if (parsed) {
          return NextResponse.json(parsed);
        }
        console.error(`[generate] ${model}: invalid JSON. First 500:`, result.text.slice(0, 500));
        lastError = 'AI returned invalid JSON - try again';
        continue;
      }
      lastError = result.error || 'no text';
      console.warn(`[generate] ${model} failed: ${lastError}`);
    }

    return NextResponse.json({ error: lastError }, { status: 500 });
  } catch (err) {
    console.error('[generate] Unexpected error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function tryModel(model: string, prompt: string, apiKey: string): Promise<{ text?: string; error?: string }> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 16384,
          responseMimeType: 'application/json',
        },
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return { error: `HTTP ${resp.status}: ${data?.error?.message || 'unknown'}` };
    }

    const candidate = data?.candidates?.[0];
    if (!candidate) return { error: 'no candidate in response' };

    const parts: Array<{ text?: string }> = candidate?.content?.parts || [];
    let bestText = '';
    for (const p of parts) {
      if (p.text && p.text.length > bestText.length) {
        bestText = p.text;
      }
    }

    if (bestText.trim()) return { text: bestText };
    return { error: `empty text, parts=${parts.length}, finishReason=${candidate?.finishReason}` };

  } catch (e) {
    return { error: `fetch error: ${String(e)}` };
  }
}

function extractJSON(raw: string): { blocks: unknown[] } | null {
  try { const p = JSON.parse(raw.trim()); if (p.blocks?.length >= 3) return { ...p, blocks: p.blocks.slice(0, 3) }; } catch { /* ignore */ }

  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    const p = JSON.parse(raw.slice(start, end + 1));
    if (!p.blocks || !Array.isArray(p.blocks) || p.blocks.length < 3) {
      console.error('[generate] blocks < 3:', JSON.stringify(p).slice(0, 200));
      return null;
    }
    return { ...p, blocks: p.blocks.slice(0, 3) };
  } catch (e) {
    console.error('[generate] JSON extract failed:', String(e));
    return null;
  }
}

function buildPrompt(name: string, position: string, description: string): string {
  return `Ты — эксперт HR-тестирования и психологии. Создай профессиональный тест для кандидата.

Имя кандидата: "${name}"
Вакансия: "${position}"
${description ? `Описание вакансии: "${description}"` : ''}

ВЕРНИ ТОЛЬКО валидный JSON (без markdown, без текста до или после JSON).

СТРУКТУРА — ровно 3 блока:

БЛОК 1 — «Личностный профиль» (психотип и характер)
- СТРОГО ситуационные и поведенческие вопросы
- НЕЛЬЗЯ: логические задачи, математику, профессиональные термины
- Цель: определить психотип кандидата по осям:
  * Экстраверсия / Интроверсия (коммуникабельность, инициативность)
  * Интуиция / Сенсорика (абстрактное vs конкретное мышление)
  * Логика / Эмпатия (рациональные vs эмоциональные решения)
  * Гибкость / Структурность (адаптация vs планирование)
  * Акцентуации: гипертим (активный, рискованный), эпилептоид (педантичный, упорный), шизоид (независимый, нестандартный), тревожный (осторожный, ответственный), демонстративный (харизматичный, публичный)
- Задавай косвенные ситуационные вопросы — НЕ «Вы экстраверт?», а сценарии
- correctAnswer должен указывать на один из психотипов/акцентуаций
- Пример: «На корпоративе вы...» / «Замечаете ли вы маленькие детали в окружении?»

БЛОК 2 — «Логика и аналитическое мышление»
- СТРОГО логика, числа, паттерны, последовательности, аналогии, умозаключения
- НЕЛЬЗЯ: профессиональная тематика "${position}", финансы, управление, технологии
- Можно: «Продолжите ряд: 2, 4, 8, 16, ...», силлогизмы, пространственное мышление, задачи на соотношения
- Все вопросы имеют однозначный правильный ответ
- Сложность: 3 лёгких / 3 средних / 4 сложных (сложные — уровень GMAT/IQ)

БЛОК 3 — «Профессиональные знания: ${position}»
- СТРОГО по компетенциям, необходимым для "${position}"
${description ? `- Используй описание вакансии для точной настройки вопросов` : ''}
- Вопросы должны проверять реальные знания: инструменты, методы, ситуации из практики
- Сложность: 3 базовых / 3 средних / 4 экспертных
- Вопросы уникальны для каждого запуска (рандомизируй темы и формулировки)

JSON-ФОРМАТ:
{
  "blocks": [
    {
      "name": "Личностный профиль",
      "description": "Определение психотипа и характерологических особенностей",
      "timeLimit": 10,
      "questions": [
        {
          "question": "Текст вопроса",
          "options": ["Вариант А", "Вариант Б", "Вариант В", "Вариант Г"],
          "correctAnswer": 0,
          "difficulty": "easy",
          "psychoAxis": "extraversion"
        }
      ]
    },
    {
      "name": "Логика и аналитическое мышление",
      "description": "Способность к анализу, структурному и логическому мышлению",
      "timeLimit": 10,
      "questions": []
    },
    {
      "name": "Профессиональные знания",
      "description": "Компетентность в области ${position}",
      "timeLimit": 10,
      "questions": []
    }
  ]
}

ПРАВИЛА:
- В каждом блоке РОВНО 10 вопросов
- Каждый вопрос имеет РОВНО 4 варианта ответа
- correctAnswer — число от 0 до 3

ВАЖНО ДЛЯ БЛОКА 1 (Личностный профиль):
- В этом блоке НЕТ правильных и неправильных ответов — все варианты одинаково допустимы
- correctAnswer в блоке 1 — это НЕ правильный ответ, а метка психотипа варианта:
  * 0 = инициативный/активный/лидерский (соответствует гипертиму)
  * 1 = эмоциональный/коммуникабельный/ориентированный на людей (демонстративный)
  * 2 = педантичный/осторожный/системный (эпилептоид/тревожный)
  * 3 = независимый/аналитичный/нестандартный (шизоид)
- Все 4 варианта ответа должны звучать ОДИНАКОВО ПРАВДОПОДОБНО для реального кандидата
- Используй косвенные поведенческие сценарии, а НЕ прямые вопросы о типе личности

ВАЖНО ДЛЯ БЛОКОВ 2 И 3:
- correctAnswer — действительно правильный ответ (один из 0-3)
- Все тексты на русском языке
- Вопросы должны быть УНИКАЛЬНЫМИ — не повторяй шаблонные примеры из промпта
- Верни ТОЛЬКО JSON, без каких-либо пояснений`;
}
