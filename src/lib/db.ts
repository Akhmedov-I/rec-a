import { db } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, Timestamp } from 'firebase/firestore';

export { db };

export type UserRole = 'admin' | 'requester' | 'recruiter' | 'manager' | 'hrd' | 'private_recruiter';

export interface UserProfile {
    uid: string;
    email: string;
    displayName?: string;
    role: UserRole;
    companyId?: string; // null for private_recruiter
    createdAt: Timestamp;
}

export interface Company {
    id: string;
    name: string;
    description?: string;
    createdAt: Timestamp;
}

export interface Requisition {
    id: string;
    companyId: string; // or user ID if private_recruiter
    title: string;
    description: string;
    requirements: {
        education: string[];
        experience: string[];
        field: string;
        softSkills: string[];
        psychoType: string[];
        responsibilities: string[];
        conditions: string;
    };
    workTypes?: string[];
    salaryMin?: number;
    salaryMax?: number;
    recommendation?: string;
    aiGenerated: boolean;
    status: 'open' | 'in_progress' | 'testing' | 'interview' | 'offer' | 'closed' | 'hired' | 'paused';
    createdBy: string; // userId
    assignedTo?: string;     // recruiter userId
    assignedToName?: string; // recruiter display name (denormalized)
    createdAt: Timestamp;
    closedAt?: Timestamp;
    offer?: {
        salary: number;
        startDate: string;
        conditions: string;
        preparedBy: string;
        acceptedCandidateId?: string;
    };
}

export interface CandidateAiScores {
    education: number;       // 0-100
    experience: number;      // 0-100
    field: number;           // 0-100
    responsibilities: number;// 0-100
    psychoType: number;      // 0-100
    softSkills: number;      // 0-100
}

export interface Candidate {
    id: string;
    requisitionId: string;
    companyId: string;
    fullName: string;
    resumeUrl?: string;
    aiAnalysis?: string;          // Legacy full text (backward compat)
    aiRating?: number;            // 0-100 weighted overall score
    aiField?: string;             // profession/area from CV
    aiRecommendedRole?: string;   // recommended role
    aiEducation?: string;         // education summary from CV
    aiExperience?: string;        // experience summary from CV
    aiScores?: CandidateAiScores; // per-criterion breakdown
    aiStrengths?: string;         // strengths narrative
    aiWeaknesses?: string;        // weaknesses narrative
    aiMatchAnalysis?: string;     // match analysis narrative
    aiRecommendation?: string;    // final recommendation text
    // Interview pipeline
    interviewDate?: string;       // ISO date string
    interviewOutcome?: 'passed' | 'failed' | 'pending';
    interviewNotes?: string;
    status: 'new' | 'testing' | 'interview' | 'offer' | 'accepted' | 'rejected';
    createdAt: Timestamp;
}

export interface TestBlock {
    name: string;
    description: string;
    questions?: {
        question: string;
        options: string[];
        correctAnswer: number; // index
    }[];
    timeLimit: number; // in minutes, usually 10
}

export interface BlockResult {
    blockName: string;
    score: number;
    maxScore: number;
    answers: number[];   // selected answer indices
    questions: {         // full snapshot for review
        question: string;
        options: string[];
        correctAnswer: number;
    }[];
}

export interface TestSession {
    id: string;
    candidateId: string;
    requisitionId: string;
    companyId: string;
    token: string;
    candidateName: string;   // pre-filled on test page
    companyName: string;     // shown on test page
    position: string;        // job title for block 3 generation
    blocks: TestBlock[];
    status: 'pending' | 'in_progress' | 'completed' | 'abandoned';
    blockResults?: BlockResult[];  // full Q&A for review
    aiRecommendation?: string;
    createdAt: Timestamp;
    startedAt?: Timestamp;
    completedAt?: Timestamp;
}

// Basic DB helpers
export const createUserProfile = async (uid: string, data: Partial<UserProfile>) => {
    await setDoc(doc(db, 'users', uid), { ...data, createdAt: Timestamp.now() });
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() as UserProfile) : null;
};

export const getRequisitions = async (companyId: string): Promise<Requisition[]> => {
    const q = query(collection(db, 'requisitions'), where('companyId', '==', companyId));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Requisition));
};

/** Returns all company users that can be assigned as recruiters (role: recruiter | hrd) */
export const getRecruiters = async (companyId: string): Promise<UserProfile[]> => {
    const snap = await getDocs(query(collection(db, 'users'), where('companyId', '==', companyId)));
    return snap.docs
        .map(d => ({ uid: d.id, ...d.data() } as UserProfile))
        .filter(u => ['recruiter', 'hrd'].includes(u.role));
};
