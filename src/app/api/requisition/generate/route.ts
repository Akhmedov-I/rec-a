import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
const pdf = require('pdf-parse');
import mammoth from 'mammoth';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy');

export async function POST(req: NextRequest) {
    try {
        let textContent = '';
        let companyInfo = '';
        let workTypes = '';
        let salaryRange = '';

        const contentType = req.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            const body = await req.json();
            textContent = body.content || '';
            companyInfo = body.companyInfo || '';
            workTypes = body.workTypes ? body.workTypes.join(', ') : '';
            if (body.salaryMin || body.salaryMax) {
                salaryRange = `от ${body.salaryMin || '...'} до ${body.salaryMax || '...'} сум`;
            }
        } else if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData();
            companyInfo = (formData.get('companyInfo') as string) || '';

            const wt = formData.getAll('workTypes[]');
            if (wt.length > 0) workTypes = wt.join(', ');

            const sMin = formData.get('salaryMin');
            const sMax = formData.get('salaryMax');
            if (sMin || sMax) {
                salaryRange = `от ${sMin || '...'} до ${sMax || '...'} сум`;
            }

            const file = formData.get('file') as File;

            if (!file) {
                return NextResponse.json({ error: 'No file provided' }, { status: 400 });
            }

            const buffer = Buffer.from(await file.arrayBuffer());
            const fileName = file.name.toLowerCase();

            if (fileName.endsWith('.pdf')) {
                const data = await pdf(buffer);
                textContent = data.text;
            } else if (fileName.endsWith('.docx')) {
                const result = await mammoth.extractRawText({ buffer });
                textContent = result.value;
            } else if (fileName.match(/\.(jpg|jpeg|png)$/)) {
                // Return dummy for now, requires GoogleGenerativeAI with vision
                // const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                // ... setup file upload
                textContent = "Текст извлеченный из изображения: (Требуется настройка Vision API)";
            } else {
                textContent = buffer.toString('utf-8');
            }
        }

        if (!textContent) {
            return NextResponse.json({ error: 'Failed to extract text' }, { status: 400 });
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const prompt = `
            Ты опытный HR-специалист и рекрутер. Твоя задача — создать идеальную заявку на подбор персонала (Requisition) на основе предоставленных данных.
            
            --- ВХОДНЫЕ ДАННЫЕ ---
            Описание компании (используй для формирования привлекательного описания вакансии):
            ${companyInfo || 'Не указано'}
            
            Тип работы / график: ${workTypes || 'Не указано'}
            Вилка ЗП: ${salaryRange || 'Не указана'}
            
            Исходный запрос / текст вакансии от рекрутера:
            ${textContent}
            ------------------------
            
            Проанализируй эти данные и выдели из них структурированную информацию.
            Важно: 
            1. "Описание вакансии" (description) должно содержать ОЧЕНЬ краткий, емкий и информативный рассказ о компании и почему стоит там работать, а также коротко о самой роли. Максимум 3-4 предложения. Сохраняй суть, убирай воду. НЕ включай сюда обязанности!
            2. Образование, опыт, soft skills, психотипы и обязанности (responsibilities) должны быть в виде МАССИВОВ строк (списков), чтобы пользователь мог их легко редактировать по пунктам. Каждый пункт должен быть лаконичным (максимум 1-2 строки).
            3. Если во входных данных чего-то не хватает для полноценной вакансии, додумай наиболее подходящие и логичные требования для этой должности.
            4. В поле "recommendation" напиши свои советы для рекрутера: на что обратить особое внимание при отборе, какие могут быть сложности в поиске таких специалистов, где их лучше искать. Строго форматируй это поле как нумерованный список, где каждый пункт начинается с новой строки с цифры 1 (1., 2., 3. и т.д.). Никаких абзацев до списка быть не должно. Если исходный запрос был слишком скудным, напиши, что именно стоит уточнить у нанимающего менеджера, также в виде пунктов.
            5. СТРОГОЕ ПРАВИЛО ПО SOFT SKILLS И ПСИХОТИПАМ: Различай Личные качества (Soft Skills - ответственность, пунктуальность, умение работать в команде, стрессоустойчивость - отвечают на вопрос "Как я работаю?") от Психотипа (врожденная структура психики, интроверт/экстраверт, аналитик/эмпат, рационал/иррационал - отвечают на вопрос "Кто я по своей природе?").
            6. СТРОГОЕ ПРАВИЛО КОНФИДЕНЦИАЛЬНОСТИ: Исключи из итоговых данных (особенно из названия должности, описания и обязанностей) любые конкретные объемы работ, цифры бюджета, физические параметры объектов (например, "275км", "диаметр 1220", "бюджет 1млн"). Эти данные переданы только для твоего понимания масштаба кандидата. Пиши общими фразами: "работа с крупными инфраструктурными проектами", "масштабные трубопроводы" и т.п.

            Ответь строго в формате JSON, без маркдауна, без \`\`\`json.
            
            Структура JSON:
            {
                "title": "Название должности",
                "description": "Краткое привлекательное описание компании и вакансии (текст)",
                "requirements": {
                    "education": ["Высшее техническое", "Доп образование..."],
                    "experience": ["От 3 лет в сфере...", "Опыт управления..."],
                    "field": "Сфера работы",
                    "softSkills": ["Навык 1", "Навык 2"],
                    "psychoType": ["Психотип 1", "Психотип 2"],
                    "responsibilities": ["Обязанность 1", "Обязанность 2"],
                    "conditions": "Условия работы (текст, включи сюда информацию про ЗП и тип работы из входных данных)"
                },
                "recommendation": "Рекомендация ИИ для рекрутера (красивым текстом по пунктам)."
            }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let jsonStr = response.text();

        // Clean JSON
        jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            const parsedData = JSON.parse(jsonStr);
            return NextResponse.json({ result: parsedData });
        } catch (e) {
            console.error('Failed to parse JSON from AI:', jsonStr);
            // Fallback mock data if AI fails formatting
            return NextResponse.json({
                result: {
                    title: "Распознанная должность",
                    description: textContent.substring(0, 100) + '...',
                    requirements: {
                        education: ["Высшее"],
                        experience: ["От 1 года"],
                        field: "IT",
                        softSkills: ["Ответственность"],
                        psychoType: ["Универсальный"],
                        responsibilities: ["Разработка"],
                        conditions: "Офис/Удаленка"
                    }
                }
            });
        }

    } catch (error) {
        console.error('Error generating requisition:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
