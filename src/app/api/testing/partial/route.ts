import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';

/**
 * POST /api/testing/partial
 * Called via sendBeacon when candidate closes the tab mid-test.
 * Saves partial blockResults and marks session as 'abandoned'.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { sessionId, blockResults, totalBlocks, completedBlocks } = body;

        if (!sessionId) {
            return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
        }

        // Mark each unanswered question explicitly
        const processedResults = (blockResults || []).map((r: any) => ({
            ...r,
            answers: (r.answers || []).map((a: number) => (a === undefined || a === null ? -1 : a)),
            abandoned: true,
        }));

        await updateDoc(doc(db, 'tests', sessionId), {
            status: 'abandoned',
            abandonedAt: Timestamp.now(),
            blockResults: processedResults,
            totalBlocks: totalBlocks ?? processedResults.length,
            completedBlocks: completedBlocks ?? processedResults.length,
        });

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('[partial] Error:', err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
