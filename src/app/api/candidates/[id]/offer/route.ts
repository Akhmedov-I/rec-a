import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy');

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const body = await req.json();
        const { candidate, requisition, conditions } = body;

        if (!candidate || !requisition) {
            return NextResponse.json({ error: 'Candidate and Requisition data required' }, { status: 400 });
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `
            Составь официальный Job Offer (Предложение о работе) от лица компании для кандидата.
            Кандидат: ${candidate.fullName}
            Должность: ${requisition.title}
            
            Детали предложения (введенные рекрутером):
            ${conditions || 'Используй стандартные условия на основе описания вакансии.'}

            Описание вакансии: ${requisition.description}
            Условия из вакансии: ${requisition.requirements.conditions}

            Оффер должен быть написан в уважительном деловом стиле. 
            Включи приветствие, поздравление с успешным прохождением отбора, 
            название должности, основные условия (ЗП, график, бонусы если есть), 
            и срок действия оффера (по умолчанию 3 дня).
            
            Отвечай только текстом оффера, без лишних комментариев.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return NextResponse.json({ offerText: text });

    } catch (error) {
        console.error('Error generating offer:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
