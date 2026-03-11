import { NextResponse } from 'next/server';

// Firebase Web API Key (public, safe to use in server-side code)
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyAqehUM3b0JZQo6qRfnRNAN8CaDFwNBqaY';

export async function POST(req: Request) {
    try {
        const { email, role, companyId, inviteId } = await req.json();

        if (!email || !role || !companyId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Create Firebase Auth user via REST API — no Admin SDK needed!
        const tempPassword = `Tmp${Math.random().toString(36).slice(-10)}X1!`;

        const signUpRes = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.toLowerCase(),
                    password: tempPassword,
                    returnSecureToken: false,
                }),
            }
        );

        const signUpData = await signUpRes.json();

        if (signUpData.error) {
            const code = signUpData.error.message;
            // If user already exists, that's fine — they'll reset password anyway
            if (code !== 'EMAIL_EXISTS') {
                throw new Error(`Auth error: ${code}`);
            }
        }

        // The invite stays in Firestore.
        // When user clicks password reset link, sets password, and logs in:
        // → login page reads the invite by email → assigns role → creates profile → deletes invite
        // This is handled in /auth/login/page.tsx handleGoogleLogin and /auth/register/page.tsx

        return NextResponse.json({ success: true, email: email.toLowerCase() });

    } catch (error: any) {
        console.error('Invite API error:', error);
        return NextResponse.json({ error: error.message || 'Failed to create user' }, { status: 500 });
    }
}
