"use client";

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, Requisition, Candidate, BlockResult } from '@/lib/db';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, collection, query, where, getDocs, addDoc, Timestamp, deleteDoc, updateDoc, deleteField } from 'firebase/firestore';
import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { Upload, FileText, User, Loader2, Briefcase, Shield, Lightbulb, Sparkles, Search, Filter, Trash2, FileDown, ChevronDown, ArrowLeft, CheckCircle, ClipboardList, Beaker, Mic2, FileSignature, XCircle, Copy, Send, Plus, Pencil } from 'lucide-react';

import { toast } from 'react-hot-toast';
import ConfirmDialog from '@/components/ConfirmDialog';
import { v4 as uuidv4 } from 'uuid';

// ─── RBAC helpers ────────────────────────────────────────────────────────────
const CAN_UPLOAD_CV = ['admin', 'hrd', 'recruiter', 'private_recruiter'];
const CAN_TEST = ['admin', 'hrd', 'recruiter', 'private_recruiter'];
const CAN_INTERVIEW = ['admin', 'hrd', 'manager', 'recruiter', 'private_recruiter'];
const CAN_OFFER = ['admin', 'hrd', 'manager', 'recruiter', 'private_recruiter'];
const CAN_CLOSE = ['admin', 'hrd', 'manager', 'private_recruiter'];

// ─── Pipeline stage labels ────────────────────────────────────────────────────
const STAGES = [
    { key: 'create', label: 'Заявка', icon: ClipboardList },
    { key: 'cv', label: 'CV & AI', icon: FileText },
    { key: 'test', label: 'Тест', icon: Beaker },
    { key: 'interview', label: 'Интервью', icon: Mic2 },
    { key: 'offer', label: 'Оффер', icon: FileSignature },
    { key: 'close', label: 'Закрытие', icon: CheckCircle },
];

function statusLabel(s: string) {
    return s === 'open' ? 'Открыта' : s === 'in_progress' ? 'В работе' : s === 'testing' ? 'Тестирование'
        : s === 'interview' ? 'Интервью' : s === 'offer' ? 'Оффер' : s === 'closed' ? 'Закрыта'
            : s === 'hired' ? '✅ Закрыта (найм)' : s === 'paused' ? '⏸ Пауза' : s;
}
function statusColor(s: string) {
    return s === 'open' ? 'bg-blue-100 text-blue-700' : s === 'in_progress' ? 'bg-indigo-100 text-indigo-700'
        : s === 'hired' ? 'bg-teal-100 text-teal-700 ring-1 ring-teal-300'
            : s === 'closed' ? 'bg-gray-100 text-gray-600' : s === 'paused' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700';
}

// Derive current pipeline stage index from requisition status and candidates
function currentStageIndex(req: Requisition, cands: Candidate[]) {
    if (req.status === 'closed' || req.status === 'hired') return 5;
    if (req.offer) return 4;
    const hasInterview = cands.some(c => c.status === 'interview' || c.interviewDate);
    if (hasInterview) return 3;
    const hasTesting = cands.some(c => c.status === 'testing');
    if (hasTesting) return 2;
    if (cands.length > 0) return 1;
    return 0;
}

export default function RequisitionDetailsPage() {
    const { profile, companyName } = useAuth();
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const id = params.id as string;
    // Deep-link params from calendar: ?candidate=<id>&action=results
    const deepCandidateId = searchParams.get('candidate');
    const deepAction = searchParams.get('action');

    const [requisition, setRequisition] = useState<Requisition | null>(null);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortByRating, setSortByRating] = useState<null | 'asc' | 'desc'>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'info' | 'candidates'>('info');

    // Pipeline panel state
    const [generatingTest, setGeneratingTest] = useState<string | null>(null);
    const [generatedTest, setGeneratedTest] = useState<Record<string, string>>({});
    const [testSessions, setTestSessions] = useState<Record<string, { id?: string; token: string; status: string; blockResults?: BlockResult[]; aiRecommendation?: string; overallScore?: number; psychotype?: string }>>({});

    const [interviewCand, setInterviewCand] = useState<string | null>(null);
    const [interviewMode, setInterviewMode] = useState<'schedule' | 'results'>('schedule');
    const [interviewForm, setInterviewForm] = useState({ date: '', time: '', interviewerId: '', interviewerName: '', notes: '', salary: '', conditions: '', outcome: 'pending' as 'pending' | 'passed' | 'failed' });
    const [savingInterview, setSavingInterview] = useState(false);
    // Users who can be interviewers (fetched per company)
    const [companyUsers, setCompanyUsers] = useState<{ uid: string; name: string }[]>([]);
    const [offerForm, setOfferForm] = useState({ salary: '', startDate: '', conditions: '', acceptedCandidateId: '' });
    const [savingOffer, setSavingOffer] = useState(false);
    const [closingReq, setClosingReq] = useState(false);
    const [editingOffer, setEditingOffer] = useState(false);

    const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; candidate: Candidate | null }>({ isOpen: false, candidate: null });
    const [expandedCandidates, setExpandedCandidates] = useState<Set<string>>(new Set());
    const toggleExpand = (cid: string) => setExpandedCandidates(prev => { const n = new Set(prev); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });

    // #10 Add from base modal
    const [addFromBaseOpen, setAddFromBaseOpen] = useState(false);
    const [baseSearch, setBaseSearch] = useState('');
    const [baseCandidates, setBaseCandidates] = useState<Candidate[]>([]);
    const [baseLoading, setBaseLoading] = useState(false);
    const [addingFromBase, setAddingFromBase] = useState<string | null>(null);
    const [uploadingSignedOffer, setUploadingSignedOffer] = useState(false);
    const [showDeleteReqConfirm, setShowDeleteReqConfirm] = useState(false);


    // Pre-fill offer form if already saved
    useEffect(() => {
        if (requisition?.offer) {
            setOfferForm({
                salary: requisition.offer.salary?.toString() || '',
                startDate: requisition.offer.startDate || '',
                conditions: requisition.offer.conditions || '',
                acceptedCandidateId: requisition.offer.acceptedCandidateId || '',
            });
        }
    }, [requisition]);

    useEffect(() => {
        const fetchData = async () => {
            if (!profile || !id) return;
            try {
                const docRef = doc(db, 'requisitions', id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) setRequisition({ id: docSnap.id, ...docSnap.data() } as Requisition);

                const q = query(collection(db, 'candidates'), where('requisitionId', '==', id));
                const qSnap = await getDocs(q);
                const cands: Candidate[] = [];
                qSnap.forEach(d => cands.push({ id: d.id, ...d.data() } as Candidate));
                cands.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
                setCandidates(cands);

                // Load test sessions — always use the LATEST test per candidate
                const sessions: Record<string, { id?: string; token: string; status: string; blockResults?: BlockResult[]; aiRecommendation?: string; overallScore?: number; psychotype?: string }> = {};
                for (const c of cands) {
                    const tq = query(collection(db, 'tests'), where('candidateId', '==', c.id));
                    const tSnap = await getDocs(tq);
                    if (!tSnap.empty) {
                        // Sort by createdAt desc in JS to always get the latest test (avoids needing a composite index)
                        const sorted = tSnap.docs.slice().sort((a, b) => {
                            const ta = a.data().createdAt?.toMillis?.() ?? 0;
                            const tb = b.data().createdAt?.toMillis?.() ?? 0;
                            return tb - ta; // newest first
                        });
                        const latestDoc = sorted[0];
                        const t = latestDoc.data();
                        // Store the doc ID so handleGenerateTest can delete it when regenerating
                        sessions[c.id] = { id: latestDoc.id, token: t.token, status: t.status, blockResults: t.blockResults, aiRecommendation: t.aiRecommendation, overallScore: t.overallScore, psychotype: t.psychotype };
                    }
                }
                setTestSessions(sessions);

                // Fetch company users for interviewer selector
                const usersQ = query(collection(db, 'users'), where('companyId', '==', profile.companyId || profile.uid));
                const usersSnap = await getDocs(usersQ);
                const users = usersSnap.docs.map(d => {
                    const u = d.data() as any;
                    return { uid: u.uid || d.id, name: u.displayName || u.email || 'Пользователь' };
                }).filter(u => u.uid);
                setCompanyUsers(users);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        fetchData();
    }, [id, profile]);

    // ── Deep-link from calendar: auto-open interview results form ────────────
    useEffect(() => {
        if (!deepCandidateId || deepAction !== 'results' || candidates.length === 0) return;
        const cand = candidates.find(c => c.id === deepCandidateId);
        if (!cand) return;
        // Switch to candidates tab
        setActiveTab('candidates');
        // Pre-fill and open results form
        setInterviewMode('results');
        setInterviewCand(cand.id);
        setInterviewForm({
            date: '',
            time: '',
            interviewerId: '',
            interviewerName: '',
            notes: (cand as any).interviewNotes || '',
            salary: (cand as any).interviewSalary || '',
            conditions: (cand as any).interviewConditions || '',
            outcome: ((cand as any).interviewOutcome as any) || 'pending',
        });
        // Scroll to that candidate card after a short delay
        setTimeout(() => {
            const el = document.getElementById(`cand-${cand.id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 400);
    }, [deepCandidateId, deepAction, candidates]);

    const role = profile?.role || '';
    const canUploadCV = CAN_UPLOAD_CV.includes(role);
    const canTest = CAN_TEST.includes(role);
    const canInterview = CAN_INTERVIEW.includes(role);
    const canOffer = CAN_OFFER.includes(role);
    const canClose = CAN_CLOSE.includes(role);

    // ── File Upload & AI Analysis ──────────────────────────────────────────
    const handleFileUploadInternal = async (file: File) => {
        if (!file || !requisition || !profile) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('requisition', JSON.stringify(requisition));
            formData.append('companyId', profile.companyId || profile.uid);
            formData.append('reqId', id);

            const apiRes = await fetch('/api/candidates/analyze', { method: 'POST', body: formData });
            const data = await apiRes.json();

            if (apiRes.ok) {
                const aiResult = data.result;
                const newCandidate: Omit<Candidate, 'id'> = {
                    requisitionId: id,
                    companyId: profile.companyId || profile.uid,
                    fullName: aiResult.fullName || 'Неизвестный кандидат',
                    resumeUrl: data.downloadUrl || '',
                    aiRating: Number(aiResult.rating) || 0,
                    aiField: aiResult.field || '',
                    aiRecommendedRole: aiResult.recommendedRole || '',
                    aiEducation: aiResult.education || '',
                    aiExperience: aiResult.experience || '',
                    aiScores: aiResult.scores || undefined,
                    aiStrengths: aiResult.strengths || '',
                    aiWeaknesses: aiResult.weaknesses || '',
                    aiMatchAnalysis: aiResult.matchAnalysis || '',
                    aiRecommendation: aiResult.recommendation || '',
                    aiAnalysis: '',
                    status: 'new',
                    createdAt: Timestamp.now(),
                };
                const candRef = await addDoc(collection(db, 'candidates'), newCandidate);
                setCandidates(prev => [{ id: candRef.id, ...newCandidate } as Candidate, ...prev]);
                toast.success('Кандидат успешно добавлен!');
            } else { toast.error('Ошибка анализа: ' + data.error); }
        } catch { toast.error('Ошибка при загрузке кандидата'); }
        finally { setUploading(false); }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) { await handleFileUploadInternal(file); e.target.value = ''; }
    };

    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFileUploadInternal(f); };
    const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };

    // ── Delete Candidate ───────────────────────────────────────────────────
    const handleDeleteCandidate = (cand: Candidate) => setConfirmDialog({ isOpen: true, candidate: cand });
    const confirmDeleteCandidate = async () => {
        const cand = confirmDialog.candidate;
        if (!cand) return;
        setConfirmDialog({ isOpen: false, candidate: null });
        setDeletingId(cand.id);
        try {
            await deleteDoc(doc(db, 'candidates', cand.id));
            setCandidates(prev => prev.filter(c => c.id !== cand.id));
        } catch { toast.error('Не удалось удалить кандидата.'); }
        finally { setDeletingId(null); }
    };

    // ── Generate Test ──────────────────────────────────────────────────────
    const handleGenerateTest = async (cand: Candidate) => {
        if (!cand.requisitionId) return;
        setGeneratingTest(cand.id);
        try {
            // #2: Delete old test session if it exists
            const oldSession = testSessions[cand.id];
            if (oldSession?.id) {
                try { await deleteDoc(doc(db, 'tests', oldSession.id)); } catch { /* ignore */ }
            }

            const token = uuidv4();
            const response = await fetch('/api/testing/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidateName: cand.fullName,
                    position: requisition?.title || '',
                    requisitionId: cand.requisitionId,
                }),
            });
            const data = await response.json();
            if (response.ok) {
                const newTest = {
                    candidateId: cand.id,
                    requisitionId: cand.requisitionId,
                    companyId: cand.companyId,
                    token,
                    candidateName: cand.fullName,
                    companyName: companyName || 'Компания',
                    position: requisition?.title || '',
                    blocks: data.blocks,
                    status: 'pending',
                    createdAt: Timestamp.now(),
                };
                const testRef = await addDoc(collection(db, 'tests'), newTest);
                await updateDoc(doc(db, 'candidates', cand.id), { status: 'testing' });
                const link = `${window.location.origin}/ru/test/${token}`;
                setGeneratedTest(prev => ({ ...prev, [cand.id]: link }));
                setTestSessions(prev => ({ ...prev, [cand.id]: { id: testRef.id, token, status: 'pending' } as any }));
                setCandidates(prev => prev.map(c => c.id === cand.id ? { ...c, status: 'testing' } : c));
                toast.success('Тест создан! Ссылка готова.');
            } else { toast.error('Ошибка генерации: ' + data.error); }
        } catch { toast.error('Ошибка при генерации теста'); }
        finally { setGeneratingTest(null); }
    };

    // ── Reject / Unreject Candidate (#9) ───────────────────────────────────
    const handleRejectCandidate = async (cand: Candidate) => {
        try {
            await updateDoc(doc(db, 'candidates', cand.id), {
                status: 'rejected',
                prevStatus: cand.status, // store previous status for unreject
            });
            setCandidates(prev => prev.map(c => c.id === cand.id ? { ...c, status: 'rejected' as any, prevStatus: cand.status } : c));
            toast.success('Кандидату отказано.');
        } catch { toast.error('Ошибка при отказе кандидату'); }
    };

    const handleUnrejectCandidate = async (cand: Candidate & { prevStatus?: string }) => {
        const restoreStatus = (cand.prevStatus as any) || 'new';
        try {
            await updateDoc(doc(db, 'candidates', cand.id), {
                status: restoreStatus,
                prevStatus: null,
            });
            setCandidates(prev => prev.map(c => c.id === cand.id ? { ...c, status: restoreStatus, prevStatus: undefined } : c));
            toast.success('Отказ отозван.');
        } catch { toast.error('Ошибка при отзыве отказа'); }
    };

    // ── Add from Base (#10) ────────────────────────────────────────────────
    const openAddFromBase = async () => {
        setAddFromBaseOpen(true);
        setBaseLoading(true);
        try {
            const companyId = profile?.companyId || profile?.uid;
            if (!companyId) return;
            const q = query(collection(db, 'candidates'), where('companyId', '==', companyId));
            const snap = await getDocs(q);
            const existingIds = new Set(candidates.map(c => c.id));
            const others: Candidate[] = [];
            snap.forEach(d => {
                if (!existingIds.has(d.id)) {
                    others.push({ id: d.id, ...d.data() } as Candidate);
                }
            });
            setBaseCandidates(others);
        } catch { toast.error('Ошибка загрузки базы'); }
        finally { setBaseLoading(false); }
    };

    const handleAddFromBase = async (cand: Candidate) => {
        if (!id) return;
        setAddingFromBase(cand.id);
        try {
            await updateDoc(doc(db, 'candidates', cand.id), {
                requisitionId: id,
                companyId: profile?.companyId || profile?.uid,
            });
            setCandidates(prev => [...prev, { ...cand, requisitionId: id }]);
            setBaseCandidates(prev => prev.filter(c => c.id !== cand.id));
            toast.success(`${cand.fullName} добавлен в заявку.`);
        } catch { toast.error('Ошибка при добавлении'); }
        finally { setAddingFromBase(null); }
    };



    // ── Schedule Interview: saves date + time + interviewer ─────────────────
    const handleScheduleInterview = async () => {
        if (!interviewCand || !interviewForm.date) return;
        setSavingInterview(true);
        try {
            const interviewDateTime = interviewForm.time
                ? `${interviewForm.date} ${interviewForm.time}`
                : interviewForm.date;
            await updateDoc(doc(db, 'candidates', interviewCand), {
                interviewDate: interviewDateTime,
                interviewerId: interviewForm.interviewerId || null,
                interviewerName: interviewForm.interviewerName || null,
                status: 'interview',
            });
            setCandidates(prev => prev.map(c => c.id === interviewCand
                ? { ...c, interviewDate: interviewDateTime, interviewerId: interviewForm.interviewerId as any, interviewerName: interviewForm.interviewerName as any, status: 'interview' as any }
                : c));
            if (requisition && requisition.status !== 'interview') {
                await updateDoc(doc(db, 'requisitions', id), { status: 'interview' });
                setRequisition(prev => prev ? { ...prev, status: 'interview' } : prev);
            }
            setInterviewCand(null);
            toast.success('Интервью назначено!');
        } catch { toast.error('Ошибка сохранения'); }
        finally { setSavingInterview(false); }
    };

    // ── Save Interview Results: outcome + salary + conditions + notes ───────
    const handleSaveResults = async () => {
        if (!interviewCand) return;
        setSavingInterview(true);
        try {
            const newStatus = interviewForm.outcome === 'passed' ? 'offer'
                : interviewForm.outcome === 'failed' ? 'rejected'
                    : 'interview';
            await updateDoc(doc(db, 'candidates', interviewCand), {
                interviewOutcome: interviewForm.outcome,
                interviewNotes: interviewForm.notes,
                interviewSalary: interviewForm.salary,
                interviewConditions: interviewForm.conditions,
                status: newStatus,
            });
            setCandidates(prev => prev.map(c => c.id === interviewCand ? {
                ...c,
                interviewOutcome: interviewForm.outcome as any,
                interviewNotes: interviewForm.notes,
                interviewSalary: interviewForm.salary,
                interviewConditions: interviewForm.conditions,
                status: newStatus as any,
            } : c));
            setInterviewCand(null);
            toast.success('Результаты сохранены!');
        } catch { toast.error('Ошибка сохранения результатов'); }
        finally { setSavingInterview(false); }
    };

    // ── Upload Signed Offer PDF ───────────────────────────────────────────────
    const handleUploadSignedOffer = async (file: File) => {
        if (!file || !id) return;
        if (file.type !== 'application/pdf') { toast.error('Только PDF файлы'); return; }
        setUploadingSignedOffer(true);
        try {
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const storagePath = `offers/${id}/signed_${Date.now()}_${safeName}`;
            const storageRef = ref(storage, storagePath);
            await uploadBytes(storageRef, new Uint8Array(await file.arrayBuffer()), { contentType: 'application/pdf' });
            const url = await getDownloadURL(storageRef);
            await updateDoc(doc(db, 'requisitions', id), { 'offer.signedOfferUrl': url });
            setRequisition(prev => prev ? { ...prev, offer: { ...prev.offer!, signedOfferUrl: url } as any } : prev);
            toast.success('Подписанный оффер прикреплён!');
        } catch { toast.error('Ошибка загрузки файла'); }
        finally { setUploadingSignedOffer(false); }
    };

    // ── Save Offer (create or edit) ──────────────────────────────────────────
    const handleSaveOffer = async () => {
        setSavingOffer(true);
        try {
            const now = Timestamp.now();
            const offer = {
                salary: Number(offerForm.salary.replace(/\D/g, '')) || 0,
                startDate: offerForm.startDate,
                conditions: offerForm.conditions,
                preparedBy: profile?.uid || '',
                preparedByName: profile?.displayName || profile?.email || '',
                acceptedCandidateId: offerForm.acceptedCandidateId,
                acceptedCandidateName: candidates.find(c => c.id === offerForm.acceptedCandidateId)?.fullName || '',
                approvedBy: profile?.uid || '',
                approvedByName: profile?.displayName || profile?.email || '',
                approvedAt: now,
                offerSentAt: now,
                offerStatus: 'pending' as 'pending' | 'accepted' | 'declined',
            };
            await updateDoc(doc(db, 'requisitions', id), { offer, status: 'offer' });
            setRequisition(prev => prev ? { ...prev, offer, status: 'offer' } : prev);
            if (offerForm.acceptedCandidateId) {
                await updateDoc(doc(db, 'candidates', offerForm.acceptedCandidateId), { status: 'offer' });
                setCandidates(prev => prev.map(c => c.id === offerForm.acceptedCandidateId ? { ...c, status: 'offer' as any } : c));
            }
            setEditingOffer(false);
            setActiveTab('info');
            toast.success('Оффер сохранён!');
        } catch { toast.error('Ошибка сохранения оффера'); }
        finally { setSavingOffer(false); }
    };

    // ── Candidate accepted → close requisition ───────────────────────────────
    const handleAcceptOffer = async () => {
        if (!requisition?.offer?.acceptedCandidateId) return;
        setSavingOffer(true);
        try {
            const now = Timestamp.now();
            await updateDoc(doc(db, 'requisitions', id), {
                'offer.offerStatus': 'accepted',
                'offer.acceptedAt': now,
                status: 'hired',
                closedAt: now,
            });
            await updateDoc(doc(db, 'candidates', requisition.offer.acceptedCandidateId), { status: 'accepted' });
            setCandidates(prev => prev.map(c => c.id === requisition!.offer!.acceptedCandidateId ? { ...c, status: 'accepted' as any } : c));
            setRequisition(prev => prev ? {
                ...prev, status: 'hired', closedAt: now,
                offer: { ...prev.offer!, offerStatus: 'accepted', acceptedAt: now },
            } : prev);
            toast.success('Кандидат принял оффер! Заявка закрыта наймом. ✅');
        } catch { toast.error('Ошибка'); }
        finally { setSavingOffer(false); }
    };

    // ── Candidate declined → clear offer entirely so a new one can be created ──
    const handleDeclineOffer = async () => {
        if (!requisition?.offer?.acceptedCandidateId) return;
        setSavingOffer(true);
        try {
            const { deleteField } = await import('firebase/firestore');
            await updateDoc(doc(db, 'requisitions', id), { offer: deleteField() });
            await updateDoc(doc(db, 'candidates', requisition.offer.acceptedCandidateId), { status: 'offer_declined' });
            setCandidates(prev => prev.map(c => c.id === requisition!.offer!.acceptedCandidateId ? { ...c, status: 'offer_declined' as any } : c));
            setRequisition(prev => prev ? { ...prev, offer: undefined } : prev);
            setEditingOffer(false);
            setOfferForm({ salary: '', startDate: '', conditions: '', acceptedCandidateId: '' });
            toast.success('Оффер отклонён. Введите новый оффер для другого кандидата.');
        } catch { toast.error('Ошибка'); }
        finally { setSavingOffer(false); }
    };

    // ── Resume requisition (re-open after declined / manual close) ───────────
    const handleResumeRequisition = async () => {
        setClosingReq(true);
        try {
            await updateDoc(doc(db, 'requisitions', id), { status: 'offer', closedAt: null });
            setRequisition(prev => prev ? { ...prev, status: 'offer', closedAt: undefined } : prev);
            toast.success('Процесс возобновлён!');
        } catch { toast.error('Ошибка'); }
        finally { setClosingReq(false); }
    };

    // ── Pause requisition ─────────────────────────────────────────────────────
    const handlePauseRequisition = async () => {
        setClosingReq(true);
        try {
            await updateDoc(doc(db, 'requisitions', id), { status: 'paused', pausedAt: Timestamp.now() });
            setRequisition(prev => prev ? { ...prev, status: 'paused' } : prev);
            toast.success('Заявка приостановлена.');
        } catch { toast.error('Ошибка'); }
        finally { setClosingReq(false); }
    };

    // ── Resume from pause ─────────────────────────────────────────────────────
    const handleResumeFromPause = async () => {
        setClosingReq(true);
        try {
            await updateDoc(doc(db, 'requisitions', id), { status: 'in_progress', pausedAt: null });
            setRequisition(prev => prev ? { ...prev, status: 'in_progress' } : prev);
            toast.success('Заявка возобновлена!');
        } catch { toast.error('Ошибка'); }
        finally { setClosingReq(false); }
    };

    // ── Close Requisition (manual) ────────────────────────────────────────────
    const handleCloseRequisition = async () => {
        setClosingReq(true);
        try {
            await updateDoc(doc(db, 'requisitions', id), { status: 'closed', closedAt: Timestamp.now() });
            setRequisition(prev => prev ? { ...prev, status: 'closed', closedAt: Timestamp.now() } : prev);
            toast.success('Заявка закрыта!');
        } catch { toast.error('Ошибка закрытия заявки'); }
        finally { setClosingReq(false); }
    };

    // ── Delete Requisition ───────────────────────────────────
    const handleDeleteRequisition = () => {
        setShowDeleteReqConfirm(true);
    };

    const confirmDeleteRequisition = async () => {
        setShowDeleteReqConfirm(false);
        setClosingReq(true);
        try {
            await deleteDoc(doc(db, 'requisitions', id));
            toast.success('Заявка удалена');
            router.push('/dashboard/requisitions');
        } catch { toast.error('Ошибка удаления'); }
        finally { setClosingReq(false); }
    };

    if (loading) return <div className="p-10 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" /></div>;
    if (!requisition) return <div className="p-10 text-center">Заявка не найдена</div>;

    const stageIdx = currentStageIndex(requisition, candidates);

    const filtered = candidates
        .filter(c => {
            if (searchTerm && !c.fullName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            if (statusFilter !== 'all' && c.status !== statusFilter) return false;
            return true;
        })
        .sort((a, b) => {
            if (sortByRating === 'desc') return (b.aiRating ?? 0) - (a.aiRating ?? 0);
            if (sortByRating === 'asc') return (a.aiRating ?? 0) - (b.aiRating ?? 0);
            return b.createdAt.toMillis() - a.createdAt.toMillis();
        });

    return (
        <>
            <ConfirmDialog
                isOpen={showDeleteReqConfirm}
                title="Удалить заявку?"
                message={`Заявка «${requisition.title}» будет удалена безвозвратно. Это действие нельзя отменить.`}
                confirmLabel="Удалить"
                cancelLabel="Отмена"
                variant="danger"
                onConfirm={confirmDeleteRequisition}
                onCancel={() => setShowDeleteReqConfirm(false)}
            />
            <div className="max-w-[1400px] mx-auto flex flex-col gap-6 animate-fade-in-up pb-10">

                {/* ── Back button ──────────────────────────── */}
                <button onClick={() => router.push('/dashboard/requisitions')}
                    className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors font-semibold w-fit group">
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Заявки на подбор
                </button>

                {/* ── Pipeline Stage Tracker ───────────────── */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
                    <div className="flex items-center justify-between">
                        {STAGES.map((stage, idx) => {
                            const Icon = stage.icon;
                            const done = idx < stageIdx;
                            const active = idx === stageIdx;
                            return (
                                <div key={stage.key} className="flex items-center flex-1 last:flex-none">
                                    <div className={`flex flex-col items-center gap-1.5 ${idx <= stageIdx ? 'opacity-100' : 'opacity-40'}`}>
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-all ${done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-gray-100 text-gray-400'}`}>
                                            {done ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                                        </div>
                                        <span className={`text-xs font-bold ${active ? 'text-blue-700' : done ? 'text-emerald-600' : 'text-gray-400'}`}>
                                            {stage.label}
                                        </span>
                                    </div>
                                    {idx < STAGES.length - 1 && (
                                        <div className={`flex-1 h-0.5 mx-2 mb-5 rounded-full ${idx < stageIdx ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Requisition title card ───────────────── */}
                <div className="bg-white rounded-[2rem] shadow-xl shadow-gray-200/40 border border-gray-100 p-6 md:p-10 print:shadow-none print:border-none">
                    <div className="flex justify-between items-start mb-8 pb-6 border-b border-gray-100">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-2xl shadow-md">
                                <Briefcase className="w-7 h-7" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-gray-900">{requisition.title}</h2>
                                <div className="mt-2 flex gap-2">
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColor(requisition.status)}`}>
                                        {statusLabel(requisition.status)}
                                    </span>
                                    {requisition.status === 'closed' && (
                                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">✅ Закрыта</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <button onClick={() => window.print()}
                                className="print:hidden flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                Печать
                            </button>
                            <button onClick={() => router.push(`/dashboard/requisitions/${id}/edit`)}
                                className="print:hidden flex items-center gap-2 px-4 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded-xl text-sm font-bold transition-all">
                                <Pencil className="w-4 h-4" />
                                Редактировать
                            </button>
                            {canClose && (
                                <button onClick={handleDeleteRequisition} disabled={closingReq}
                                    className="print:hidden flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                                    {closingReq ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    Удалить
                                </button>
                            )}
                            {canClose && requisition.status === 'paused' ? (
                                <button onClick={handleResumeFromPause} disabled={closingReq}
                                    className="print:hidden flex items-center gap-2 px-4 py-2 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                                    {closingReq ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>▶</span>}
                                    Возобновить
                                </button>
                            ) : canClose && requisition.status !== 'closed' && (
                                <button onClick={handlePauseRequisition} disabled={closingReq}
                                    className="print:hidden flex items-center gap-2 px-4 py-2 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 text-yellow-700 rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                                    {closingReq ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>⏸</span>}
                                    Приостановить
                                </button>
                            )}
                            {canClose && requisition.status !== 'closed' && requisition.status !== 'paused' && (
                                <button onClick={handleCloseRequisition} disabled={closingReq}
                                    className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                                    {closingReq ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                                    Закрыть заявку
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 mb-6 print:hidden">
                        {(['info', 'candidates'] as const).map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)}
                                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === tab ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                                {tab === 'info' ? '📋 Описание вакансии' : `👤 Кандидаты (${candidates.length})`}
                            </button>
                        ))}
                    </div>

                    {/* ── TAB: Info ── */}
                    {activeTab === 'info' && (
                        <div className="space-y-8 print:block">
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100">
                                <label className="block text-xs font-black text-blue-700 uppercase tracking-widest mb-3">Описание вакансии</label>
                                <p className="text-base text-gray-800 leading-relaxed whitespace-pre-wrap font-medium">{requisition.description || '—'}</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100">
                                    <label className="block text-xs font-black text-blue-700 uppercase tracking-widest mb-2">Зарплата (сум)</label>
                                    <div className="text-lg font-black text-gray-900">
                                        {requisition.salaryMin || requisition.salaryMax
                                            ? `${requisition.salaryMin ? 'от ' + requisition.salaryMin.toLocaleString('ru-RU') : ''} ${requisition.salaryMax ? 'до ' + requisition.salaryMax.toLocaleString('ru-RU') : ''}`
                                            : 'Не указана'}
                                    </div>
                                </div>
                                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100">
                                    <label className="block text-xs font-black text-blue-700 uppercase tracking-widest mb-2">График/Тип работы</label>
                                    <div className="text-lg font-black text-gray-900">{requisition.workTypes?.join(', ') || 'Не указан'}</div>
                                </div>
                            </div>

                            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-6 rounded-2xl border border-emerald-100">
                                <h3 className="flex items-center gap-2 text-sm font-black text-emerald-800 uppercase tracking-wider mb-5">
                                    <Shield className="w-4 h-4" /> Требования и обязанности
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {[
                                        { label: 'Обязанности', items: requisition.requirements?.responsibilities },
                                        { label: 'Опыт', items: requisition.requirements?.experience },
                                        { label: 'Образование', items: requisition.requirements?.education },
                                    ].map(({ label, items }) => (
                                        <div key={label}>
                                            <label className="block text-sm font-black text-emerald-800 uppercase tracking-wider mb-3">{label}</label>
                                            <ul className="space-y-1.5">
                                                {Array.isArray(items) && items.length > 0
                                                    ? items.map((r, i) => <li key={i} className="flex items-start gap-2 text-sm text-gray-800 font-medium"><span className="text-emerald-500 mt-0.5">•</span><span>{r}</span></li>)
                                                    : <li className="text-sm text-gray-400 italic">Не указано</li>}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {(requisition.requirements?.softSkills?.length || requisition.requirements?.psychoType?.length) ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-2xl border border-purple-100">
                                        <label className="block text-sm font-black text-purple-800 uppercase tracking-wider mb-4">Soft Skills</label>
                                        <div className="flex flex-wrap gap-2">
                                            {requisition.requirements?.softSkills?.map((r, i) => <span key={i} className="px-3 py-1.5 bg-white border border-purple-200/60 rounded-xl text-sm font-medium text-gray-800 shadow-sm">{r}</span>)}
                                        </div>
                                    </div>
                                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-2xl border border-purple-100">
                                        <label className="block text-sm font-black text-purple-800 uppercase tracking-wider mb-4">Психотип</label>
                                        <div className="flex flex-wrap gap-2">
                                            {requisition.requirements?.psychoType?.map((r, i) => <span key={i} className="px-3 py-1.5 bg-white border border-purple-200/60 rounded-xl text-sm font-medium text-gray-800 shadow-sm">{r}</span>)}
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            {requisition.recommendation && (
                                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100/60 rounded-3xl p-8 shadow-inner">
                                    <div className="flex items-center gap-2 text-indigo-900 font-black text-base mb-4 uppercase tracking-wider">
                                        <Lightbulb className="w-5 h-5 text-indigo-600" /> Рекомендация для рекрутера
                                        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 bg-indigo-200/50 text-indigo-700 rounded-md tracking-wider">Скрыто</span>
                                    </div>
                                    <p className="text-base text-indigo-950 font-medium leading-relaxed whitespace-pre-wrap bg-white/60 p-5 rounded-2xl border border-indigo-100/50">{requisition.recommendation}</p>
                                </div>
                            )}

                            {/* ── Stage 5: Offer Panel ── */}
                            {canOffer && stageIdx >= 3 && (
                                <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 space-y-5">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                        <h3 className="text-base font-black text-amber-800 uppercase tracking-wider flex items-center gap-2">
                                            <FileSignature className="w-4 h-4" /> Оффер для кандидата
                                        </h3>
                                        {/* Global status badge */}
                                        {requisition.status === 'closed' && (requisition.offer as any)?.offerStatus === 'accepted' && (
                                            <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-700 border border-emerald-200">✅ Заявка закрыта — кандидат принят</span>
                                        )}
                                        {(requisition.offer as any)?.offerStatus === 'declined' && (
                                            <span className="px-3 py-1 rounded-full text-xs font-black bg-red-100 text-red-700 border border-red-200">❌ Оффер отклонён</span>
                                        )}
                                        {(requisition.offer as any)?.offerStatus === 'pending' && (
                                            <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-700 border border-amber-200">⏳ Ожидается ответ</span>
                                        )}
                                    </div>

                                    {/* ── VIEW mode: offer already exists and not editing ── */}
                                    {requisition.offer && !editingOffer ? (
                                        <div className="space-y-4">
                                            {/* Info grid */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="bg-white border border-amber-100 rounded-xl p-4">
                                                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">👤 Кандидат</p>
                                                    <p className="text-sm font-black text-gray-900">{(requisition.offer as any).acceptedCandidateName || candidates.find(c => c.id === (requisition.offer as any).acceptedCandidateId)?.fullName || '—'}</p>
                                                </div>
                                                <div className="bg-white border border-amber-100 rounded-xl p-4">
                                                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">💰 Зарплата</p>
                                                    <p className="text-sm font-black text-gray-900">{requisition.offer.salary.toLocaleString('ru-RU')} сум</p>
                                                </div>
                                                <div className="bg-white border border-amber-100 rounded-xl p-4">
                                                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">📅 Дата выхода</p>
                                                    <p className="text-sm font-black text-gray-900">{requisition.offer.startDate || '—'}</p>
                                                </div>
                                                <div className="bg-white border border-amber-100 rounded-xl p-4">
                                                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">📝 Условия</p>
                                                    <p className="text-sm font-medium text-gray-700">{requisition.offer.conditions || '—'}</p>
                                                </div>
                                            </div>

                                            {/* Approval meta */}
                                            <div className="bg-white border border-amber-100 rounded-xl px-4 py-3 flex flex-wrap gap-4 text-xs text-gray-500">
                                                {(requisition.offer as any).approvedByName && (
                                                    <span>🖊 Согласовал: <strong className="text-gray-800">{(requisition.offer as any).approvedByName}</strong></span>
                                                )}
                                                {(requisition.offer as any).approvedAt && (
                                                    <span>📆 Дата согласования: <strong className="text-gray-800">
                                                        {new Date((requisition.offer as any).approvedAt.seconds * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </strong></span>
                                                )}
                                            </div>

                                            {/* ── Signed Offer PDF ── */}
                                            <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
                                                <p className="text-xs font-black text-teal-700 uppercase tracking-wider mb-2">📎 Подписанный оффер (PDF)</p>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {/* Download existing */}
                                                    {(requisition.offer as any).signedOfferUrl && (
                                                        <a
                                                            href={(requisition.offer as any).signedOfferUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold transition-all"
                                                        >
                                                            <FileDown className="w-4 h-4" />
                                                            Скачать / Просмотреть
                                                        </a>
                                                    )}
                                                    {/* Upload */}
                                                    <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all ${uploadingSignedOffer ? 'opacity-50 pointer-events-none' : ''} ${(requisition.offer as any).signedOfferUrl ? 'bg-white border border-teal-300 text-teal-700 hover:bg-teal-50' : 'bg-teal-600 hover:bg-teal-700 text-white'}`}>
                                                        {uploadingSignedOffer
                                                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Загрузка...</>
                                                            : <><Upload className="w-4 h-4" /> {(requisition.offer as any).signedOfferUrl ? 'Заменить PDF' : 'Прикрепить PDF'}</>
                                                        }
                                                        <input
                                                            type="file"
                                                            accept="application/pdf"
                                                            className="hidden"
                                                            onChange={e => { const f = e.target.files?.[0]; if (f) { handleUploadSignedOffer(f); e.target.value = ''; } }}
                                                        />
                                                    </label>
                                                    {!(requisition.offer as any).signedOfferUrl && (
                                                        <span className="text-xs text-teal-600 italic">Прикрепите скан подписанного оффера</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Action buttons */}
                                            <div className="flex flex-wrap gap-2 pt-1">
                                                {/* Edit offer */}
                                                {requisition.status !== 'closed' && (
                                                    <button
                                                        onClick={() => {
                                                            setEditingOffer(true);
                                                            setOfferForm({
                                                                salary: String(requisition.offer!.salary),
                                                                startDate: requisition.offer!.startDate,
                                                                conditions: requisition.offer!.conditions || '',
                                                                acceptedCandidateId: (requisition.offer as any).acceptedCandidateId || '',
                                                            });
                                                        }}
                                                        className="flex items-center gap-1.5 px-4 py-2 bg-white border border-amber-300 text-amber-800 rounded-xl text-sm font-bold hover:bg-amber-50 transition-all">
                                                        ✏️ Изменить оффер
                                                    </button>
                                                )}

                                                {/* Accept — closes req */}
                                                {(requisition.offer as any).offerStatus !== 'accepted' && requisition.status !== 'closed' && (
                                                    <button onClick={handleAcceptOffer} disabled={savingOffer}
                                                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                                                        {savingOffer ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                                        Кандидат принял → Закрыть заявку
                                                    </button>
                                                )}

                                                {/* Decline — keeps req open */}
                                                {(requisition.offer as any).offerStatus === 'pending' && (
                                                    <button onClick={handleDeclineOffer} disabled={savingOffer}
                                                        className="flex items-center gap-1.5 px-4 py-2 bg-red-50 border border-red-200 hover:bg-red-100 text-red-700 rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                                                        <XCircle className="w-4 h-4" /> Кандидат отказался
                                                    </button>
                                                )}

                                                {/* Resume after declined or after manual close */}
                                                {((requisition.offer as any)?.offerStatus === 'declined' || requisition.status === 'closed') && (
                                                    <button onClick={handleResumeRequisition} disabled={closingReq}
                                                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                                                        {closingReq ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                                        🔄 Возобновить процесс
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        /* ── CREATE / EDIT form ── */
                                        <div className="space-y-4">
                                            {editingOffer && (
                                                <p className="text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-lg inline-block">✏️ Режим редактирования оффера</p>
                                            )}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-600 mb-1">Кандидат *</label>
                                                    <select value={offerForm.acceptedCandidateId} onChange={e => setOfferForm(f => ({ ...f, acceptedCandidateId: e.target.value }))}
                                                        className="select-field w-full">
                                                        <option value="">— Выберите кандидата —</option>
                                                        {candidates.filter(c => c.status !== 'rejected').map(c => (
                                                            <option key={c.id} value={c.id}>{c.fullName} ({c.aiRating || 0}%)</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-600 mb-1">Зарплата (сум) *</label>
                                                    <input
                                                        type="text"
                                                        value={offerForm.salary ? Number(offerForm.salary.replace(/\D/g, '')).toLocaleString('ru-RU') : ''}
                                                        onChange={e => { const raw = e.target.value.replace(/\D/g, ''); setOfferForm(f => ({ ...f, salary: raw })); }}
                                                        placeholder="500 000"
                                                        className="w-full p-2.5 border rounded-xl text-sm" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-600 mb-1">Дата выхода *</label>
                                                    <input type="date" value={offerForm.startDate} onChange={e => setOfferForm(f => ({ ...f, startDate: e.target.value }))}
                                                        className="w-full p-2.5 border rounded-xl text-sm" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-600 mb-1">Условия / Примечания</label>
                                                    <input type="text" value={offerForm.conditions} onChange={e => setOfferForm(f => ({ ...f, conditions: e.target.value }))}
                                                        placeholder="Испытательный срок 3 мес..." className="w-full p-2.5 border rounded-xl text-sm" />
                                                </div>
                                                <div className="md:col-span-2 flex gap-2">
                                                    <button onClick={handleSaveOffer} disabled={savingOffer || !offerForm.salary || !offerForm.startDate || !offerForm.acceptedCandidateId}
                                                        className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                                        {savingOffer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                        {editingOffer ? 'Сохранить изменения' : 'Сохранить оффер'}
                                                    </button>
                                                    {editingOffer && (
                                                        <button onClick={() => setEditingOffer(false)}
                                                            className="px-4 py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-all">
                                                            Отмена
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── TAB: Candidates ── */}
                    {activeTab === 'candidates' && (
                        <div className="space-y-4">
                            {/* Upload Area */}
                            {canUploadCV && requisition.status !== 'closed' && (
                                <label
                                    className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${uploading ? 'bg-gray-50 border-gray-200' : isDragging ? 'bg-blue-100 border-blue-400 scale-[1.02]' : 'bg-blue-50/50 border-blue-200 hover:bg-blue-50 hover:border-blue-300'}`}
                                    onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
                                        {uploading ? <Loader2 className="w-8 h-8 mb-3 text-blue-500 animate-spin" /> : <Upload className={`w-8 h-8 mb-3 ${isDragging ? 'text-blue-600' : 'text-blue-400'}`} />}
                                        <p className="text-sm font-bold text-gray-700 mb-1">{uploading ? 'AI анализирует резюме...' : isDragging ? 'Отпустите файл' : 'Загрузить резюме (PDF / DOCX)'}</p>
                                    </div>
                                    <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} accept=".pdf,.doc,.docx" />
                                </label>
                            )}

                            {/* Search & Filter & Sort */}
                            <div className="flex flex-col sm:flex-row gap-3">
                                {/* Search */}
                                <div className="flex-1 relative">
                                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                                    <input type="text" placeholder="Поиск по имени..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none" />
                                </div>
                                {/* Stage filter */}
                                <div className="relative min-w-[160px]">
                                    <Filter className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                                        className="select-field select-field-icon w-full">
                                        <option value="all">Все этапы</option>
                                        <option value="new">🔵 Новый</option>
                                        <option value="testing">🟡 Тестирование</option>
                                        <option value="interview">🟣 Интервью</option>
                                        <option value="offer">🟢 Оффер</option>
                                        <option value="accepted">✅ Принят</option>
                                        <option value="rejected">❌ Отказ</option>
                                        <option value="offer_declined">🚫 Отказался от оффера</option>
                                    </select>
                                </div>
                                {/* Sort by AI Rating */}
                                <button
                                    onClick={() => setSortByRating(s => s === null ? 'desc' : s === 'desc' ? 'asc' : null)}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors whitespace-nowrap ${sortByRating
                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                        }`}
                                >
                                    <ChevronDown className={`w-4 h-4 transition-transform ${sortByRating === 'asc' ? 'rotate-180' : ''}`} />
                                    AI рейтинг
                                    {sortByRating === 'desc' && <span className="text-xs text-indigo-500">↓ выс.</span>}
                                    {sortByRating === 'asc' && <span className="text-xs text-indigo-500">↑ низ.</span>}
                                </button>
                                {/* #10 Add from base */}
                                <button onClick={openAddFromBase}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-green-200 bg-green-50 text-green-700 text-sm font-semibold hover:bg-green-100 transition-colors whitespace-nowrap">
                                    <Plus className="w-4 h-4" /> Из базы
                                </button>
                            </div>

                            {/* #10 Add from base modal */}
                            {addFromBaseOpen && (
                                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center px-4"
                                    onClick={() => setAddFromBaseOpen(false)}>
                                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
                                        onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center justify-between px-6 py-4 border-b">
                                            <h3 className="font-bold text-gray-900 text-base">Добавить кандидата из базы</h3>
                                            <button onClick={() => setAddFromBaseOpen(false)}
                                                className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
                                        </div>
                                        <div className="px-6 py-3 border-b">
                                            <input type="text" value={baseSearch} onChange={e => setBaseSearch(e.target.value)}
                                                placeholder="Поиск по имени..."
                                                className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                                        </div>
                                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
                                            {baseLoading ? (
                                                <div className="text-center py-8 text-gray-400">
                                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                                    <p className="text-sm">Загрузка...</p>
                                                </div>
                                            ) : baseCandidates.filter(c => !baseSearch || c.fullName.toLowerCase().includes(baseSearch.toLowerCase())).length === 0 ? (
                                                <div className="text-center py-8 text-gray-400">
                                                    <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                                    <p className="text-sm">Кандидаты не найдены</p>
                                                </div>
                                            ) : baseCandidates
                                                .filter(c => !baseSearch || c.fullName.toLowerCase().includes(baseSearch.toLowerCase()))
                                                .map(cand => (
                                                    <div key={cand.id} className="flex items-center justify-between p-3 border rounded-xl hover:bg-gray-50">
                                                        <div>
                                                            <p className="text-sm font-semibold text-gray-900">{cand.fullName}</p>
                                                            <p className="text-xs text-gray-400">{(cand as any).position || (cand as any).reqTitle || '—'}</p>
                                                        </div>
                                                        <button onClick={() => handleAddFromBase(cand)}
                                                            disabled={addingFromBase === cand.id}
                                                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50">
                                                            {addingFromBase === cand.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Добавить'}
                                                        </button>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </div>
                            )}


                            {/* Candidates List */}
                            {filtered.length === 0 ? (
                                <div className="py-16 text-center">
                                    <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 font-medium">{candidates.length === 0 ? 'Пока нет кандидатов.' : 'Ничего не найдено.'}</p>
                                    <p className="text-gray-400 text-sm mt-1">{candidates.length === 0 ? 'Загрузите резюме выше.' : 'Измените фильтры.'}</p>
                                </div>
                            ) : (
                                <ul className="space-y-3">
                                    {filtered.map(cand => {
                                        const isExpanded = expandedCandidates.has(cand.id);
                                        const sc = cand.aiScores;
                                        const hasAI = !!(sc || cand.aiStrengths || cand.aiWeaknesses || cand.aiMatchAnalysis || cand.aiRecommendation);
                                        const rating = cand.aiRating ?? 0;
                                        const ratingColor = rating >= 75 ? 'text-emerald-600' : rating >= 50 ? 'text-blue-600' : rating >= 30 ? 'text-amber-500' : 'text-red-500';
                                        const ratingBg = rating >= 75 ? 'bg-emerald-50 border-emerald-200' : rating >= 50 ? 'bg-blue-50 border-blue-200' : rating >= 30 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
                                        const scoreBg = (v: number) => v >= 75 ? 'bg-emerald-500' : v >= 50 ? 'bg-blue-500' : v >= 25 ? 'bg-amber-400' : 'bg-red-400';
                                        const scoreTxt = (v: number) => v >= 75 ? 'text-emerald-700' : v >= 50 ? 'text-blue-700' : v >= 25 ? 'text-amber-700' : 'text-red-600';
                                        const recColor = (rec: string) => /НЕ РЕКОМЕНДУЮ/i.test(rec) ? 'bg-red-50 border-red-200 text-red-900' : /УСЛОВНО/i.test(rec) ? 'bg-amber-50 border-amber-200 text-amber-900' : /РЕКОМЕНДУЮ/i.test(rec) ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-indigo-50 border-indigo-200 text-indigo-900';
                                        const candStatusLabel = (s: string) => s === 'new' ? 'Новый' : s === 'testing' ? 'Тестирование' : s === 'interview' ? 'Интервью' : s === 'offer' ? 'Оффер' : s === 'accepted' ? 'Принят ✅' : s === 'rejected' ? 'Отказ' : s === 'offer_declined' ? 'Отказался от оффера' : s;
                                        const candStatusColor = (s: string) => s === 'new' ? 'bg-blue-100 text-blue-700' : s === 'testing' ? 'bg-yellow-100 text-yellow-700' : s === 'interview' ? 'bg-purple-100 text-purple-700' : s === 'offer' ? 'bg-green-100 text-green-700' : s === 'accepted' ? 'bg-emerald-100 text-emerald-700' : s === 'rejected' ? 'bg-red-100 text-red-700' : s === 'offer_declined' ? 'bg-rose-100 text-rose-700 line-through' : 'bg-gray-100 text-gray-700';
                                        const testSession = testSessions[cand.id];
                                        const testLink = generatedTest[cand.id] || (testSession ? `${typeof window !== 'undefined' ? window.location.origin : ''}/ru/test/${testSession.token}` : '');

                                        return (
                                            <li id={`cand-${cand.id}`} key={cand.id} className="border-2 border-gray-200 rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-all hover:border-blue-300" style={{ borderLeft: '4px solid #3b82f6' }}>
                                                {/* ── Card Header: Row 1 — Avatar + Name/Rating + Actions ── */}
                                                <div className="p-4 flex items-center gap-3 flex-wrap">
                                                    {/* Avatar */}
                                                    <div className="p-2 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl text-blue-600 shrink-0">
                                                        <User className="w-5 h-5" />
                                                    </div>

                                                    {/* Name + status + AI Rating under name */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h3 className="text-base font-bold text-gray-900">{cand.fullName}</h3>
                                                            <span className={`px-2.5 py-0.5 rounded-lg font-bold text-xs ${candStatusColor(cand.status)}`}>{candStatusLabel(cand.status)}</span>
                                                        </div>
                                                        {/* AI Rating — prominent, under name */}
                                                        <div className="flex items-center gap-2 flex-wrap mt-1.5">
                                                            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border font-bold ${ratingBg}`}>
                                                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">AI рейтинг</span>
                                                                <span className={`text-lg font-black ${ratingColor}`}>{rating}%</span>
                                                                {(cand as any).testRatingUpdated
                                                                    ? <span className="text-[9px] bg-indigo-100 text-indigo-600 font-bold px-1.5 py-0.5 rounded-md">CV+Тест</span>
                                                                    : <span className="text-[9px] bg-gray-100 text-gray-400 font-bold px-1.5 py-0.5 rounded-md">только CV</span>
                                                                }
                                                            </div>
                                                            {/* Test score badge — shown when test is completed */}
                                                            {testSession?.status === 'completed' && testSession.overallScore != null && (() => {
                                                                const ts = testSession.overallScore;
                                                                const tsBg = ts >= 75 ? 'bg-emerald-50 border-emerald-300' : ts >= 50 ? 'bg-teal-50 border-teal-300' : ts >= 30 ? 'bg-amber-50 border-amber-300' : 'bg-red-50 border-red-300';
                                                                const tsTxt = ts >= 75 ? 'text-emerald-700' : ts >= 50 ? 'text-teal-700' : ts >= 30 ? 'text-amber-700' : 'text-red-600';
                                                                return (
                                                                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border font-bold ${tsBg}`}>
                                                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">🧪 Тест</span>
                                                                        <span className={`text-lg font-black ${tsTxt}`}>{ts}%</span>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>

                                                    {/* Actions row — right side */}
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {/* Download resume */}
                                                        {cand.resumeUrl && (
                                                            <a href={cand.resumeUrl} target="_blank" rel="noreferrer"
                                                                className="flex items-center gap-1 px-2.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-medium text-xs transition-colors">
                                                                <FileDown className="w-3.5 h-3.5" /> Резюме
                                                            </a>
                                                        )}
                                                        {/* Test actions */}
                                                        {canTest && (
                                                            <>
                                                                {/* Create test — only if no session yet */}
                                                                {!testSession && (
                                                                    <button onClick={() => handleGenerateTest(cand)} disabled={generatingTest === cand.id}
                                                                        className="flex items-center gap-1.5 px-3 py-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-xl font-medium text-xs transition-colors disabled:opacity-50">
                                                                        {generatingTest === cand.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Beaker className="w-3.5 h-3.5" />}
                                                                        Создать тест
                                                                    </button>
                                                                )}
                                                                {/* Copy link — only when pending (link is one-time, in_progress/abandoned means it was used) */}
                                                                {testSession && testSession.status === 'pending' && (
                                                                    <button onClick={() => { const link = `${window.location.origin}/ru/test/${testSession.token}`; navigator.clipboard.writeText(link); toast.success('Ссылка скопирована!'); }}
                                                                        className="flex items-center gap-1.5 px-3 py-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-xl font-medium text-xs transition-colors">
                                                                        <Copy className="w-3.5 h-3.5" />
                                                                        Скопировать ссылку
                                                                    </button>
                                                                )}
                                                                {/* Regenerate test — when completed, abandoned, OR in_progress (candidate left mid-test) */}
                                                                {testSession && (testSession.status === 'completed' || testSession.status === 'abandoned' || testSession.status === 'in_progress') && (
                                                                    <button onClick={() => handleGenerateTest(cand)} disabled={generatingTest === cand.id}
                                                                        className="flex items-center gap-1.5 px-3 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-xl font-medium text-xs transition-colors disabled:opacity-50">
                                                                        {generatingTest === cand.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Beaker className="w-3.5 h-3.5" />}
                                                                        🔄 Новая ссылка
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                        {/* Interview — schedule or reschedule: date+time only */}
                                                        {canInterview && (cand.status === 'testing' || cand.status === 'new' || cand.status === 'interview' || testSession?.status === 'completed') && (
                                                            <button
                                                                onClick={() => {
                                                                    setInterviewMode('schedule');
                                                                    setInterviewCand(cand.id);
                                                                    const existing = (cand as any).interviewDate as string | undefined;
                                                                    const parts = existing ? existing.split(' ') : [];
                                                                    setInterviewForm({ date: parts[0] || '', time: parts[1] || '', interviewerId: (cand as any).interviewerId || '', interviewerName: (cand as any).interviewerName || '', notes: '', salary: '', conditions: '', outcome: 'pending' });
                                                                }}
                                                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-medium text-xs transition-colors ${(cand as any).interviewDate
                                                                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-700'
                                                                    : 'bg-purple-50 hover:bg-purple-100 text-purple-700'
                                                                    }`}>
                                                                <Mic2 className="w-3.5 h-3.5" />
                                                                {(cand as any).interviewDate ? '✏️ Изменить дату' : 'назначить интервью'}
                                                            </button>
                                                        )}
                                                        {/* Внести результаты — only when interview is scheduled and pending */}
                                                        {(cand as any).interviewDate && (
                                                            <>
                                                                {(!((cand as any).interviewOutcome) || (cand as any).interviewOutcome === 'pending') && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setInterviewMode('results');
                                                                            setInterviewCand(cand.id);
                                                                            setInterviewForm({
                                                                                date: '',
                                                                                time: '',
                                                                                interviewerId: '',
                                                                                interviewerName: '',
                                                                                notes: (cand as any).interviewNotes || '',
                                                                                salary: (cand as any).interviewSalary || '',
                                                                                conditions: (cand as any).interviewConditions || '',
                                                                                outcome: 'pending',
                                                                            });
                                                                        }}
                                                                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-medium text-xs transition-colors">
                                                                        <CheckCircle className="w-3.5 h-3.5" /> Внести результаты
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                        {/* Отчёт — available after test is completed, regardless of interview */}
                                                        {(testSession?.status === 'completed' || (cand as any).interviewDate) && (
                                                            <a href={`/ru/dashboard/requisitions/${id}/report/${cand.id}`} target="_blank" rel="noreferrer"
                                                                className="flex items-center gap-1.5 px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl font-medium text-xs transition-colors">
                                                                <FileText className="w-3.5 h-3.5" /> Отчёт
                                                            </a>
                                                        )}
                                                        {/* Reject / Unreject — #9 */}
                                                        {(cand as any).status === 'rejected' ? (
                                                            <button onClick={() => handleUnrejectCandidate(cand as any)}
                                                                className="flex items-center gap-1 px-2.5 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl font-medium text-xs transition-colors">
                                                                <CheckCircle className="w-3.5 h-3.5" /> Отозвать отказ
                                                            </button>
                                                        ) : (
                                                            <button onClick={() => handleRejectCandidate(cand)}
                                                                className="flex items-center gap-1 px-2.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-medium text-xs transition-colors">
                                                                <XCircle className="w-3.5 h-3.5" /> Отказать
                                                            </button>
                                                        )}
                                                        {/* Delete */}
                                                        <button onClick={() => handleDeleteCandidate(cand)} disabled={deletingId === cand.id}
                                                            className="flex items-center gap-1 px-2.5 py-2 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-xl font-medium text-xs transition-colors disabled:opacity-40">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>

                                                        {/* AI Analysis — rightmost (after delete) */}
                                                        {hasAI && (
                                                            <button onClick={() => toggleExpand(cand.id)}
                                                                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-medium text-xs transition-colors">
                                                                <Sparkles className="w-3.5 h-3.5" />
                                                                {isExpanded ? 'Свернуть' : 'AI анализ'}
                                                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>


                                                {/* ── Card Info Row — field / role / education / interview ── */}
                                                {(cand.aiField || cand.aiRecommendedRole || cand.aiEducation || cand.interviewDate) && (
                                                    <div className="px-4 pb-3 flex flex-wrap gap-2">
                                                        {cand.aiField && (
                                                            <span className="flex items-center gap-1 px-2.5 py-1 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-600">
                                                                💼 {cand.aiField}
                                                            </span>
                                                        )}
                                                        {cand.aiRecommendedRole && (
                                                            <span className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-lg text-xs font-semibold text-indigo-700">
                                                                🎯 {cand.aiRecommendedRole}
                                                            </span>
                                                        )}
                                                        {cand.aiEducation && (
                                                            <span className="flex items-center gap-1 px-2.5 py-1 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-600 break-words">
                                                                🎓 {cand.aiEducation}
                                                            </span>
                                                        )}
                                                        {cand.interviewDate && (
                                                            <span className="flex items-center gap-1 px-2.5 py-1 bg-purple-50 border border-purple-100 rounded-lg text-xs font-semibold text-purple-700">
                                                                🎤 {cand.interviewDate} — {(cand as any).interviewOutcome === 'passed' ? '✅ Прошёл' : (cand as any).interviewOutcome === 'failed' ? '❌ Не прошёл' : '⏳ Ожидается'}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* ── Interview Results Summary ── */}
                                                {(cand as any).interviewOutcome && (cand as any).interviewOutcome !== 'pending' && (
                                                    <div className="mx-4 mb-3 rounded-xl border overflow-hidden">
                                                        <div className={`flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider ${(cand as any).interviewOutcome === 'passed' ? 'bg-emerald-50 border-b border-emerald-100 text-emerald-700' : 'bg-red-50 border-b border-red-100 text-red-700'}`}>
                                                            <CheckCircle className="w-3.5 h-3.5" />
                                                            Результаты интервью
                                                            <span className={`ml-auto px-2 py-0.5 rounded-md text-[10px] font-black ${(cand as any).interviewOutcome === 'passed' ? 'bg-emerald-200 text-emerald-800' : 'bg-red-200 text-red-800'}`}>
                                                                {(cand as any).interviewOutcome === 'passed' ? 'Прошёл ✅' : 'Не прошёл ❌'}
                                                            </span>
                                                        </div>
                                                        <div className="bg-white px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                                            {(cand as any).interviewSalary && (
                                                                <div>
                                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Запрашиваемая ЗП</p>
                                                                    <p className="font-bold text-gray-800">
                                                                        {Number(String((cand as any).interviewSalary).replace(/\D/g, '')).toLocaleString('ru-RU')} сум
                                                                    </p>
                                                                </div>
                                                            )}
                                                            {(cand as any).interviewConditions && (
                                                                <div>
                                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Условия труда</p>
                                                                    <p className="font-semibold text-gray-800">{(cand as any).interviewConditions}</p>
                                                                </div>
                                                            )}
                                                            {(cand as any).interviewNotes && (
                                                                <div className="sm:col-span-3">
                                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Комментарий интервьюера</p>
                                                                    <p className="text-gray-700 whitespace-pre-wrap">{(cand as any).interviewNotes}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── Test Link Banner — only for pending links (one-time) ── */}
                                                {testSession?.token && testSession.status === 'pending' && (() => {
                                                    const liveLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/ru/test/${testSession.token}`;
                                                    return (
                                                        <div className="px-5 pb-3">
                                                            <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                                                                <Beaker className="w-4 h-4 text-yellow-600 shrink-0" />
                                                                <input type="text" readOnly value={liveLink} className="flex-1 text-xs bg-transparent outline-none text-yellow-800 font-mono" />
                                                                <button onClick={() => { navigator.clipboard.writeText(liveLink); toast.success('Скопировано!'); }}
                                                                    className="p-1.5 bg-yellow-100 hover:bg-yellow-200 rounded-lg transition-colors">
                                                                    <Copy className="w-3.5 h-3.5 text-yellow-700" />
                                                                </button>
                                                            </div>
                                                            <p className="text-xs text-yellow-600 mt-1 ml-1">⏸ Ожидает прохождения</p>
                                                        </div>
                                                    );
                                                })()}

                                                {/* ── Abandoned / In-Progress banner ── */}
                                                {testSession?.token && (testSession.status === 'abandoned' || testSession.status === 'in_progress') && (
                                                    <div className="px-5 pb-3">
                                                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                                            <p className="text-xs font-bold text-amber-700 mb-2">⚠️ Тест прерван — кандидат не завершил тестирование</p>
                                                            {testSession.blockResults && testSession.blockResults.length > 0 ? (
                                                                <div className="flex flex-wrap gap-2">
                                                                    {testSession.blockResults.map((br: any, bi: number) => {
                                                                        const answered = (br.answers || []).filter((a: number) => a !== -1).length;
                                                                        const unanswered = (br.maxScore || 0) - answered;
                                                                        const pct = br.maxScore > 0 ? Math.round((br.score / br.maxScore) * 100) : 0;
                                                                        return (
                                                                            <div key={bi} className="px-3 py-1.5 bg-white border border-amber-200 rounded-xl text-xs">
                                                                                <p className="font-bold text-gray-700">{br.blockName}</p>
                                                                                <p className="text-gray-500">Отвечено: {answered}/{br.maxScore} · Верно: {br.score} ({pct}%) · Не отвечено: {unanswered}</p>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <p className="text-xs text-amber-600">Ответы не сохранились — кандидат вышел до начала теста.</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── Test Results Panel (matches report layout) ── */}
                                                {isExpanded && testSession?.status === 'completed' && testSession.blockResults && testSession.blockResults.length > 0 && (() => {
                                                    const br0 = testSession.blockResults[0] ?? null; // Block 1 — personality (no score)
                                                    const br1 = testSession.blockResults[1] ?? null; // Block 2 — logic
                                                    const br2 = testSession.blockResults[2] ?? null; // Block 3 — professional
                                                    const getStats = (b: typeof br0) => ({
                                                        answered: b ? b.answers.filter((a: number) => a !== -1).length : 0,
                                                        total: b ? b.questions.length : 0,
                                                        correct: b ? b.score : 0,
                                                    });
                                                    const s0 = getStats(br0), s1 = getStats(br1), s2 = getStats(br2);
                                                    const pct1 = s1.total > 0 ? Math.round((s1.correct / s1.total) * 100) : 0;
                                                    const pct2 = s2.total > 0 ? Math.round((s2.correct / s2.total) * 100) : 0;
                                                    const overallScore = testSession.overallScore ?? null;
                                                    return (
                                                        <div className="px-5 pb-5 border-t border-yellow-100 bg-yellow-50/30 pt-4">
                                                            <p className="text-xs font-black text-yellow-700 uppercase tracking-wider mb-3">📊 Результаты теста</p>

                                                            {/* Overall score + psychotype banner */}
                                                            {overallScore !== null && (
                                                                <div className="flex items-center gap-4 mb-3 p-3 bg-white border border-gray-200 rounded-xl">
                                                                    <div>
                                                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ОБЩИЙ БАЛЛ (Блоки 2+3)</div>
                                                                        <div className={`text-2xl font-black leading-none mt-0.5 ${overallScore >= 70 ? 'text-emerald-600' : overallScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                                                            {overallScore}%
                                                                        </div>
                                                                    </div>
                                                                    {testSession.psychotype && (
                                                                        <div className="border-l border-gray-200 pl-4">
                                                                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ПСИХОТИП</div>
                                                                            <div className="text-sm font-bold text-indigo-600 mt-0.5">{testSession.psychotype}</div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Per-block summary cards */}
                                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                                                                {/* Block 1 — personality, no score */}
                                                                {br0 && (
                                                                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                                                                        <div className="text-[10px] font-bold text-purple-700 mb-1">Блок 1 · {br0.blockName}</div>
                                                                        <div className="text-[9px] text-gray-400 italic mb-1">Нет правильных/неправильных ответов</div>
                                                                        <div className="text-xs text-gray-600">Отвечено: <span className="font-bold">{s0.answered}/{s0.total}</span></div>
                                                                        <div className="text-xs text-gray-400">Баллы не начисляются</div>
                                                                    </div>
                                                                )}
                                                                {/* Block 2 — logic */}
                                                                {br1 && (
                                                                    <div className={`border rounded-xl p-3 ${pct1 >= 70 ? 'bg-emerald-50 border-emerald-200' : pct1 >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                                                                        <div className={`text-[10px] font-bold mb-1 ${pct1 >= 70 ? 'text-emerald-700' : pct1 >= 40 ? 'text-amber-700' : 'text-red-700'}`}>Блок 2 · {br1.blockName}</div>
                                                                        <div className="text-xs text-gray-600">Отвечено: <span className="font-bold">{s1.answered}/{s1.total}</span></div>
                                                                        <div className={`text-xs font-bold ${pct1 >= 70 ? 'text-emerald-700' : pct1 >= 40 ? 'text-amber-700' : 'text-red-700'}`}>Правильно: {s1.correct}/{s1.total} ({pct1}%)</div>
                                                                    </div>
                                                                )}
                                                                {/* Block 3 — professional */}
                                                                {br2 && (
                                                                    <div className={`border rounded-xl p-3 ${pct2 >= 70 ? 'bg-emerald-50 border-emerald-200' : pct2 >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                                                                        <div className={`text-[10px] font-bold mb-1 ${pct2 >= 70 ? 'text-emerald-700' : pct2 >= 40 ? 'text-amber-700' : 'text-red-700'}`}>Блок 3 · {br2.blockName}</div>
                                                                        <div className="text-xs text-gray-600">Отвечено: <span className="font-bold">{s2.answered}/{s2.total}</span></div>
                                                                        <div className={`text-xs font-bold ${pct2 >= 70 ? 'text-emerald-700' : pct2 >= 40 ? 'text-amber-700' : 'text-red-700'}`}>Правильно: {s2.correct}/{s2.total} ({pct2}%)</div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* AI full analysis text */}
                                                            {testSession.aiRecommendation && (
                                                                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-800 mb-3">
                                                                    <p className="font-bold text-indigo-600 mb-1">🤖 AI-анализ по тесту</p>
                                                                    <p className="leading-relaxed whitespace-pre-wrap">{testSession.aiRecommendation}</p>
                                                                </div>
                                                            )}

                                                            {/* Q&A review — collapsible */}
                                                            <details className="group">
                                                                <summary className="cursor-pointer text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors list-none flex items-center justify-between w-full select-none px-1 py-1.5 hover:bg-gray-50 rounded-lg">
                                                                    <span>📋 Просмотреть вопросы и ответы</span>
                                                                    <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180 shrink-0" />
                                                                </summary>
                                                                <div className="mt-3 space-y-4">
                                                                    {testSession.blockResults.map((br, bi) => (
                                                                        <div key={bi}>
                                                                            <p className="text-xs font-black text-gray-600 uppercase tracking-wider mb-2">{br.blockName}</p>
                                                                            <div className="space-y-2">
                                                                                {br.questions.map((q, qi) => {
                                                                                    const chosen = br.answers[qi];
                                                                                    const correct = q.correctAnswer;
                                                                                    const noCorrect = correct === undefined || correct === null;
                                                                                    const isRight = !noCorrect && chosen === correct;
                                                                                    return (
                                                                                        <div key={qi} className={`p-3 rounded-xl border text-xs ${noCorrect ? 'bg-purple-50 border-purple-100'
                                                                                            : isRight ? 'bg-emerald-50 border-emerald-200'
                                                                                                : 'bg-red-50 border-red-200'
                                                                                            }`}>
                                                                                            <p className="font-semibold text-gray-800 mb-1">{qi + 1}. {q.question}</p>
                                                                                            <div className="space-y-0.5">
                                                                                                {q.options.map((opt, oi) => (
                                                                                                    <p key={oi} className={`${noCorrect
                                                                                                        ? oi === chosen ? 'text-purple-700 font-bold' : 'text-gray-500'
                                                                                                        : oi === correct ? 'text-emerald-700 font-bold'
                                                                                                            : oi === chosen && !isRight ? 'text-red-600 line-through'
                                                                                                                : 'text-gray-500'
                                                                                                        }`}>
                                                                                                        {noCorrect
                                                                                                            ? (oi === chosen ? '● ' : '  ')
                                                                                                            : (oi === correct ? '✓ ' : oi === chosen && !isRight ? '✗ ' : '  ')
                                                                                                        }{opt}
                                                                                                    </p>
                                                                                                ))}
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </details>
                                                        </div>
                                                    );
                                                })()}

                                                {interviewCand === cand.id && (
                                                    <div className={`px-5 pb-4 border-t pt-4 ${interviewMode === 'schedule'
                                                        ? 'border-purple-100 bg-purple-50/40'
                                                        : 'border-emerald-100 bg-emerald-50/40'
                                                        }`}>

                                                        {/* ── SCHEDULE MODE: only date + time ── */}
                                                        {interviewMode === 'schedule' && (
                                                            <>
                                                                <p className="text-xs font-black text-purple-700 uppercase tracking-wider mb-3">🎤 {(candidates.find(c => c.id === interviewCand) as any)?.interviewDate ? 'Изменить дату интервью' : 'Назначить интервью'}</p>
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-sm">
                                                                    <div>
                                                                        <label className="text-xs font-bold text-gray-600 block mb-1">Дата интервью *</label>
                                                                        <input type="date" value={interviewForm.date} onChange={e => setInterviewForm(f => ({ ...f, date: e.target.value }))}
                                                                            min={new Date().toISOString().split('T')[0]}
                                                                            className="w-full p-2.5 border rounded-xl text-sm" />
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-xs font-bold text-gray-600 block mb-1">Время</label>
                                                                        <input type="time" value={interviewForm.time} onChange={e => setInterviewForm(f => ({ ...f, time: e.target.value }))}
                                                                            className="w-full p-2.5 border rounded-xl text-sm" />
                                                                    </div>
                                                                </div>
                                                                <div className="mt-3 max-w-sm">
                                                                    <label className="text-xs font-bold text-gray-600 block mb-1">Интервьюер</label>
                                                                    <select
                                                                        value={interviewForm.interviewerId}
                                                                        onChange={e => {
                                                                            const uid = e.target.value;
                                                                            const user = companyUsers.find(u => u.uid === uid);
                                                                            setInterviewForm(f => ({ ...f, interviewerId: uid, interviewerName: user?.name || '' }));
                                                                        }}
                                                                        className="select-field w-full">
                                                                        <option value="">— Выберите интервьюера —</option>
                                                                        {companyUsers.map(u => (
                                                                            <option key={u.uid} value={u.uid}>{u.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                                <div className="flex gap-2 mt-4">
                                                                    <button onClick={handleScheduleInterview} disabled={savingInterview || !interviewForm.date}
                                                                        className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                                                                        {savingInterview ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Сохранить дату
                                                                    </button>
                                                                    <button onClick={() => setInterviewCand(null)} className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-bold">Отмена</button>
                                                                </div>
                                                            </>
                                                        )}

                                                        {/* ── RESULTS MODE: outcome + salary + conditions + notes ── */}
                                                        {interviewMode === 'results' && (
                                                            <>
                                                                <p className="text-xs font-black text-emerald-700 uppercase tracking-wider mb-3">✅ Результаты интервью</p>
                                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                                    <div>
                                                                        <label className="text-xs font-bold text-gray-600 block mb-1">Результат *</label>
                                                                        <select value={interviewForm.outcome} onChange={e => setInterviewForm(f => ({ ...f, outcome: e.target.value as any }))}
                                                                            className="select-field w-full">
                                                                            <option value="pending">Ожидается</option>
                                                                            <option value="passed">Прошёл ✅</option>
                                                                            <option value="failed">Не прошёл ❌</option>
                                                                        </select>
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-xs font-bold text-gray-600 block mb-1">Запрашиваемая ЗП</label>
                                                                        <input
                                                                            type="text"
                                                                            value={interviewForm.salary
                                                                                ? Number(interviewForm.salary.replace(/\D/g, '')).toLocaleString('ru-RU')
                                                                                : ''}
                                                                            onChange={e => {
                                                                                const raw = e.target.value.replace(/\D/g, '');
                                                                                setInterviewForm(f => ({ ...f, salary: raw }));
                                                                            }}
                                                                            placeholder="1 500 000 сум"
                                                                            className="w-full p-2.5 border rounded-xl text-sm" />
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-xs font-bold text-gray-600 block mb-1">Условия труда</label>
                                                                        <input type="text" value={interviewForm.conditions} onChange={e => setInterviewForm(f => ({ ...f, conditions: e.target.value }))}
                                                                            placeholder="График, офис/удалёнка..." className="w-full p-2.5 border rounded-xl text-sm" />
                                                                    </div>
                                                                </div>
                                                                <div className="mt-3">
                                                                    <label className="text-xs font-bold text-gray-600 block mb-1">Комментарий интервьюера</label>
                                                                    <textarea value={interviewForm.notes} onChange={e => setInterviewForm(f => ({ ...f, notes: e.target.value }))}
                                                                        placeholder="Общее впечатление, сильные/слабые стороны..."
                                                                        rows={3}
                                                                        className="w-full p-2.5 border rounded-xl text-sm resize-none" />
                                                                </div>
                                                                <div className="flex gap-2 mt-3">
                                                                    <button onClick={handleSaveResults} disabled={savingInterview}
                                                                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                                                                        {savingInterview ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Сохранить результаты
                                                                    </button>
                                                                    <button onClick={() => setInterviewCand(null)} className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-bold">Отмена</button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                )}

                                                {/* ── AI Analysis Panel — hidden by default, visible when expanded ── */}
                                                {isExpanded && hasAI && (
                                                    <div className="border-t border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white px-5 pb-5 pt-4">
                                                        {sc && (
                                                            <div className="mb-4">
                                                                <p className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> Критерии соответствия</p>
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                                                                    {([
                                                                        { key: 'experience', label: 'Опыт работы', pct: 25, val: sc.experience },
                                                                        { key: 'responsibilities', label: 'Обязанности', pct: 20, val: sc.responsibilities },
                                                                        { key: 'field', label: 'Сфера деятельности', pct: 20, val: sc.field },
                                                                        { key: 'education', label: 'Образование', pct: 15, val: sc.education },
                                                                        { key: 'softSkills', label: 'Soft Skills', pct: 10, val: sc.softSkills },
                                                                        { key: 'psychoType', label: 'Психотип', pct: 10, val: sc.psychoType },
                                                                    ] as { key: string; label: string; pct: number; val: number }[]).map(c => (
                                                                        <div key={c.key}>
                                                                            <div className="flex justify-between items-center mb-1">
                                                                                <span className="text-xs font-semibold text-gray-600">{c.label} <span className="text-gray-400 font-normal">({c.pct}%)</span></span>
                                                                                <span className={`text-xs font-black ${scoreTxt(c.val)}`}>{c.val}%</span>
                                                                            </div>
                                                                            <div className="h-1.5 bg-white/80 rounded-full overflow-hidden border border-gray-200">
                                                                                <div className={`h-full rounded-full transition-all duration-700 ${scoreBg(c.val)}`} style={{ width: `${c.val}%` }} />
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div className="space-y-2.5 text-sm">
                                                            {cand.aiStrengths && (
                                                                <div className="p-3 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-900">
                                                                    <p className="font-black text-xs uppercase tracking-wider text-emerald-600 mb-1">💪 Сильные стороны</p>
                                                                    <p className="leading-relaxed">{cand.aiStrengths}</p>
                                                                </div>
                                                            )}
                                                            {cand.aiWeaknesses && (
                                                                <div className="p-3 rounded-xl border bg-amber-50 border-amber-200 text-amber-900">
                                                                    <p className="font-black text-xs uppercase tracking-wider text-amber-600 mb-1">⚠️ Слабые стороны</p>
                                                                    <p className="leading-relaxed">{cand.aiWeaknesses}</p>
                                                                </div>
                                                            )}
                                                            {cand.aiMatchAnalysis && (
                                                                <div className="p-3 rounded-xl border bg-blue-50 border-blue-200 text-blue-900">
                                                                    <p className="font-black text-xs uppercase tracking-wider text-blue-600 mb-1">🎯 Соответствие</p>
                                                                    <p className="leading-relaxed">{cand.aiMatchAnalysis}</p>
                                                                </div>
                                                            )}
                                                            {cand.aiRecommendation && (
                                                                <div className={`p-3 rounded-xl border ${recColor(cand.aiRecommendation)}`}>
                                                                    <p className="font-black text-xs uppercase tracking-wider opacity-70 mb-1">📋 Итоговый вывод</p>
                                                                    <p className="leading-relaxed font-semibold">{cand.aiRecommendation}</p>
                                                                </div>
                                                            )}
                                                            {!cand.aiStrengths && !cand.aiRecommendation && cand.aiAnalysis && (
                                                                <div className="p-3 rounded-xl border bg-gray-50 border-gray-200 text-gray-800">
                                                                    <p className="font-black text-xs uppercase tracking-wider text-gray-500 mb-1">📄 Анализ AI</p>
                                                                    <p className="leading-relaxed whitespace-pre-wrap">{cand.aiAnalysis}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                <ConfirmDialog
                    isOpen={confirmDialog.isOpen}
                    title="Удалить кандидата?"
                    message={`Вы уверены, что хотите удалить кандидата "${confirmDialog.candidate?.fullName}"?`}
                    confirmLabel="Удалить"
                    cancelLabel="Отмена"
                    variant="danger"
                    onConfirm={confirmDeleteCandidate}
                    onCancel={() => setConfirmDialog({ isOpen: false, candidate: null })}
                />
            </div>
        </>
    );
}
