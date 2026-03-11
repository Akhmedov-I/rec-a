import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Models confirmed working for this API key (tested via ListModels + direct call)
// gemini-flash-latest is the alias that works on v1beta for this key
const GEMINI_CANDIDATES = [
    { base: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-flash-latest' },
    { base: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-pro-latest' },
    { base: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
    { base: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-pro' },
];

async function callGemini(parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>) {
    let lastErr: any;
    for (const { base, model } of GEMINI_CANDIDATES) {
        const url = `${base}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 4096,
                    }
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                console.warn(`[Gemini] ${model} (${base.includes('v1beta') ? 'v1beta' : 'v1'}) HTTP ${res.status}:`, data?.error?.message || JSON.stringify(data));
                lastErr = new Error(data?.error?.message || `HTTP ${res.status}`);
                continue;
            }
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                console.warn(`[Gemini] ${model} returned empty text`);
                lastErr = new Error('Empty response');
                continue;
            }
            console.log(`[Gemini] ✓ Success with ${model} on ${base.includes('v1beta') ? 'v1beta' : 'v1'}`);
            return text;
        } catch (err: any) {
            console.warn(`[Gemini] ${model} fetch error:`, err?.message || err);
            lastErr = err;
        }
    }
    throw lastErr || new Error('All Gemini models failed');
}

export async function POST(req: NextRequest) {
    if (!GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY is not set!');
        return NextResponse.json({ error: 'Server config error: GEMINI_API_KEY missing' }, { status: 500 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const reqDataStr = formData.get('requisition') as string;
        const companyId = formData.get('companyId') as string;
        const reqId = formData.get('reqId') as string;

        if (!file || !reqDataStr) {
            return NextResponse.json({ error: 'File and requisition data are required' }, { status: 400 });
        }

        const requisition = JSON.parse(reqDataStr);
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = file.name.toLowerCase();

        // ── UPLOAD TO FIREBASE STORAGE ──────────────────────────────────────────
        let downloadUrl = '';
        try {
            const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
            const storagePath = `resumes/${companyId || 'unknown'}/${reqId || 'unknown'}/${Date.now()}_${safeName}`;
            const storageRef = ref(storage, storagePath);
            await uploadBytes(storageRef, new Uint8Array(buffer), { contentType: file.type });
            downloadUrl = await getDownloadURL(storageRef);
            console.log('[Storage] Upload OK:', downloadUrl);
        } catch (uploadError) {
            console.error('[Storage] Upload error:', uploadError);
            // Non-fatal — continue with AI analysis even if storage fails
        }

        // ── BUILD PROMPT ─────────────────────────────────────────────────────────
        const r = requisition.requirements || {};
        const vacancyContext = `
Должность: ${requisition.title}
Описание вакансии: ${requisition.description}
Требования к образованию: ${Array.isArray(r.education) ? r.education.join(', ') : r.education || 'не указано'}
Требования к опыту: ${Array.isArray(r.experience) ? r.experience.join(', ') : r.experience || 'не указано'}
Требуемая сфера/профиль: ${r.field || 'не указано'}
Soft Skills: ${Array.isArray(r.softSkills) ? r.softSkills.join(', ') : r.softSkills || 'не указано'}
Психотип: ${Array.isArray(r.psychoType) ? r.psychoType.join(', ') : r.psychoType || 'не указано'}
Обязанности: ${Array.isArray(r.responsibilities) ? r.responsibilities.join('; ') : r.responsibilities || 'не указано'}
`.trim();

        const systemPrompt = `
Ты — опытный HRD и AI-рекрутер высокого класса. Твоя задача: детально проанализировать резюме кандидата и рассчитать рейтинг соответствия вакансии по взвешенному алгоритму.

=== ВАКАНСИЯ ===
${vacancyContext}

=== АЛГОРИТМ РАСЧЁТА РЕЙТИНГА ===
Оцени кандидата по 6 критериям (каждый от 0 до 100), затем вычисли итоговый рейтинг по формуле:
  rating = ROUND( experience*0.25 + responsibilities*0.20 + field*0.20 + education*0.15 + softSkills*0.10 + psychoType*0.10 )

Критерии оценки:
1. education (вес 15%): Насколько образование кандидата соответствует требованиям. 100 = точное совпадение, 0 = полное несоответствие.
2. experience (вес 25%): Лет опыта, уровень позиций, релевантность. 100 = превышает требования, 0 = нет опыта.
3. field (вес 20%): Соответствие сферы деятельности/профессии требуемому профилю.
4. responsibilities (вес 20%): Насколько опыт кандидата покрывает требуемые обязанности.
5. softSkills (вес 10%): Соответствие soft skills (коммуникация, лидерство и т.д.).
6. psychoType (вес 10%): Соответствие психотипа требованиям вакансии.

=== ФОРМАТ ОТВЕТА ===
Ответь СТРОГО JSON (без markdown, без лишнего текста):
{
  "fullName": "Имя Фамилия кандидата",
  "education": "Образование кандидата одной строкой",
  "experience": "Опыт работы кандидата одной строкой",
  "field": "Профессия / сфера деятельности",
  "recommendedRole": "Рекомендуемая роль в компании",
  "scores": {
    "education": 70,
    "experience": 85,
    "field": 90,
    "responsibilities": 80,
    "softSkills": 75,
    "psychoType": 60
  },
  "rating": 81,
  "strengths": "2-3 предложения о сильных сторонах кандидата",
  "weaknesses": "2-3 предложения о слабых сторонах и пробелах",
  "matchAnalysis": "3-4 предложения о конкретном соответствии требованиям вакансии",
  "recommendation": "РЕКОМЕНДУЮ / УСЛОВНО РЕКОМЕНДУЮ / НЕ РЕКОМЕНДУЮ — и краткое обоснование (1-2 предложения)"
}
Все числа — целые от 0 до 100, без кавычек. rating — взвешенная сумма по формуле выше.
ВАЖНО ДЛЯ JSON:
- Все текстовые значения должны быть в одну строку (без символов переноса строки \n внутри значений).
- Никаких неэкранированных кавычек (") внутри строк.
- Отвечай ТОЛЬКО валидным JSON — никакого текста до или после фигурных скобок.
`.trim();

        // ── CALL GEMINI ──────────────────────────────────────────────────────────
        let responseText: string;

        if (fileName.endsWith('.pdf')) {
            // PDF → send as base64 inline_data (multimodal)
            const base64 = buffer.toString('base64');
            responseText = await callGemini([
                { text: systemPrompt },
                { inlineData: { mimeType: 'application/pdf', data: base64 } },
            ]);
        } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
            // DOCX → extract text
            let docText = '';
            try {
                const extracted = await mammoth.extractRawText({ buffer });
                docText = extracted.value;
            } catch (e) {
                console.error('[DOCX] Extraction error:', e);
                docText = 'Ошибка чтения DOCX файла.';
            }
            responseText = await callGemini([{ text: `${systemPrompt}\n\n--- РЕЗЮМЕ КАНДИДАТА ---\n${docText}` }]);
        } else {
            // Plain text / other
            const textContent = buffer.toString('utf-8');
            responseText = await callGemini([{ text: `${systemPrompt}\n\n--- РЕЗЮМЕ КАНДИДАТА ---\n${textContent}` }]);
        }

        console.log('[Gemini] Raw response preview:', responseText.slice(0, 200));

        // ── BULLETPROOF JSON PARSE ────────────────────────────────────────────────
        function tryParse(s: string): any {
            try { return JSON.parse(s); } catch { return null; }
        }
        function extractJson(raw: string): any {
            // Strategy 1: strip markdown fences
            let s1 = raw.replace(/```(?:json)?/gi, '').trim();
            const r1 = tryParse(s1);
            if (r1) return r1;

            // Strategy 2: slice from first { to last }
            const a = s1.indexOf('{');
            const b = s1.lastIndexOf('}');
            if (a >= 0 && b > a) {
                const r2 = tryParse(s1.slice(a, b + 1));
                if (r2) return r2;
            }

            // Strategy 3: greedy regex
            const m = raw.match(/\{[\s\S]*\}/);
            if (m) {
                const r3 = tryParse(m[0]);
                if (r3) return r3;
            }

            // Strategy 4: extract known fields with multiline-safe regex (last resort)
            const get = (k: string): string => {
                // Match "key": "value" — value can span until next JSON key or closing brace
                const rx = new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 's');
                const mt = raw.match(rx);
                if (mt) return mt[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim();
                // Fallback: grab everything between this key's colon and the next key
                const rx2 = new RegExp(`"${k}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?:,\\s*"\\w|\\})`);
                const mt2 = raw.match(rx2);
                return mt2 ? mt2[1].replace(/\\n/g, ' ').trim() : '';
            };
            const getNum = (k: string) => { const rx = new RegExp(`"${k}"\\s*:\\s*(\\d+)`); const mt = raw.match(rx); return mt ? parseInt(mt[1], 10) : 0; };
            return {
                fullName: get('fullName') || 'Кандидат',
                education: get('education'),
                experience: get('experience'),
                field: get('field'),
                recommendedRole: get('recommendedRole'),
                strengths: get('strengths'),
                weaknesses: get('weaknesses'),
                matchAnalysis: get('matchAnalysis'),
                recommendation: get('recommendation'),
                rating: getNum('rating'),
                scores: {
                    education: getNum('education'),
                    experience: getNum('experience'),
                    field: getNum('field'),
                    responsibilities: getNum('responsibilities'),
                    softSkills: getNum('softSkills'),
                    psychoType: getNum('psychoType'),
                },
            };
        }

        const parsedData = extractJson(responseText);
        console.log('[Parse] fullName:', parsedData?.fullName, '| rating:', parsedData?.rating);

        // Normalise helper
        const toInt = (v: any) => {
            const n = parseInt(String(v ?? '0').replace(/\D/g, ''), 10);
            return isNaN(n) ? 0 : Math.min(100, Math.max(0, n));
        };

        // Normalise scores — handle flat or nested scores object
        const sc: any = parsedData.scores || {};
        const scores = {
            education: toInt(sc.education ?? 0),
            experience: toInt(sc.experience ?? 0),
            field: toInt(sc.field ?? 0),
            responsibilities: toInt(sc.responsibilities ?? 0),
            softSkills: toInt(sc.softSkills ?? 0),
            psychoType: toInt(sc.psychoType ?? 0),
        };

        // Server-side weighted rating verification
        const computedRating = Math.round(
            scores.experience * 0.25 +
            scores.responsibilities * 0.20 +
            scores.field * 0.20 +
            scores.education * 0.15 +
            scores.softSkills * 0.10 +
            scores.psychoType * 0.10
        );
        const aiRating = toInt(parsedData.rating);
        // Use AI rating if close to computed (within ±8); else use computed
        const finalRating = (aiRating > 0 && Math.abs(aiRating - computedRating) <= 8) ? aiRating : computedRating;

        const result = {
            fullName: String(parsedData.fullName || 'Кандидат'),
            education: String(parsedData.education || ''),
            experience: String(parsedData.experience || ''),
            field: String(parsedData.field || ''),
            recommendedRole: String(parsedData.recommendedRole || ''),
            rating: finalRating,
            scores,
            strengths: String(parsedData.strengths || ''),
            weaknesses: String(parsedData.weaknesses || ''),
            matchAnalysis: String(parsedData.matchAnalysis || ''),
            recommendation: String(parsedData.recommendation || ''),
        };

        console.log('[Result] rating:', result.rating, '| scores:', JSON.stringify(result.scores));
        return NextResponse.json({ result, downloadUrl });

    } catch (error: any) {
        console.error('[Analyze] Error:', error?.message || error);
        return NextResponse.json(
            { error: 'Internal Server Error', detail: error?.message || String(error) },
            { status: 500 }
        );
    }
}
