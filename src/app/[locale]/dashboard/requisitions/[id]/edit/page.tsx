"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { db, getRecruiters, UserProfile } from '@/lib/db';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import {
    ArrowLeft, Loader2, Save, Plus, Trash2,
    Briefcase, FileText, Lightbulb, User
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const PREDEFINED_WORK_TYPES = ['5/2', '6/1', '2/2', 'Вахта', 'Удаленка', 'Гибрид'];

interface ReqData {
    title: string;
    description: string;
    recommendation: string;
    salaryMin: number | null;
    salaryMax: number | null;
    workTypes: string[];
    requirements: {
        education: string[];
        experience: string[];
        field: string;
        softSkills: string[];
        psychoType: string[];
        responsibilities: string[];
        conditions: string;
    };
}

export default function EditRequisitionPage() {
    const { profile } = useAuth();
    const router = useRouter();
    const params = useParams();
    const id = params?.id as string;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [customWorkType, setCustomWorkType] = useState('');

    // Recruiter assignment
    const [recruiters, setRecruiters] = useState<UserProfile[]>([]);
    const [assignedToId, setAssignedToId] = useState('');
    const [assignedToName, setAssignedToName] = useState('');

    const [form, setForm] = useState<ReqData>({
        title: '',
        description: '',
        recommendation: '',
        salaryMin: null,
        salaryMax: null,
        workTypes: [],
        requirements: {
            education: [],
            experience: [],
            field: '',
            softSkills: [],
            psychoType: [],
            responsibilities: [],
            conditions: '',
        },
    });

    const [salaryMinStr, setSalaryMinStr] = useState('');
    const [salaryMaxStr, setSalaryMaxStr] = useState('');

    useEffect(() => {
        const load = async () => {
            if (!id) return;
            try {
                const snap = await getDoc(doc(db, 'requisitions', id));
                if (!snap.exists()) { toast.error('Заявка не найдена'); router.back(); return; }
                const d = snap.data() as any;
                setForm({
                    title: d.title || '',
                    description: d.description || '',
                    recommendation: d.recommendation || '',
                    salaryMin: d.salaryMin ?? null,
                    salaryMax: d.salaryMax ?? null,
                    workTypes: d.workTypes || [],
                    requirements: {
                        education: d.requirements?.education || [],
                        experience: d.requirements?.experience || [],
                        field: d.requirements?.field || '',
                        softSkills: d.requirements?.softSkills || [],
                        psychoType: d.requirements?.psychoType || [],
                        responsibilities: d.requirements?.responsibilities || [],
                        conditions: d.requirements?.conditions || '',
                    },
                });
                if (d.salaryMin) setSalaryMinStr(Number(d.salaryMin).toLocaleString('ru-RU'));
                if (d.salaryMax) setSalaryMaxStr(Number(d.salaryMax).toLocaleString('ru-RU'));
                // Load existing recruiter assignment
                if (d.assignedTo) setAssignedToId(d.assignedTo);
                if (d.assignedToName) setAssignedToName(d.assignedToName);
            } catch { toast.error('Ошибка загрузки'); }
            finally { setLoading(false); }
        };
        load();

        // Load recruiter list for admin/hrd
        if (profile && ['admin', 'hrd'].includes(profile.role) && profile.companyId) {
            getRecruiters(profile.companyId).then(setRecruiters);
        }
    }, [id, router]);

    const toggleWorkType = (wt: string) => {
        setForm(f => ({
            ...f,
            workTypes: f.workTypes.includes(wt) ? f.workTypes.filter(t => t !== wt) : [...f.workTypes, wt],
        }));
    };

    const addCustomWorkType = () => {
        if (customWorkType.trim() && !form.workTypes.includes(customWorkType.trim())) {
            setForm(f => ({ ...f, workTypes: [...f.workTypes, customWorkType.trim()] }));
            setCustomWorkType('');
        }
    };

    const updateList = (field: keyof ReqData['requirements'], index: number, value: string) => {
        setForm(f => {
            const arr = [...(f.requirements[field] as string[])];
            arr[index] = value;
            return { ...f, requirements: { ...f.requirements, [field]: arr } };
        });
    };

    const removeFromList = (field: keyof ReqData['requirements'], index: number) => {
        setForm(f => {
            const arr = (f.requirements[field] as string[]).filter((_, i) => i !== index);
            return { ...f, requirements: { ...f.requirements, [field]: arr } };
        });
    };

    const addToList = (field: keyof ReqData['requirements']) => {
        setForm(f => ({ ...f, requirements: { ...f.requirements, [field]: [...(f.requirements[field] as string[]), ''] } }));
    };

    const handleSave = async () => {
        if (!profile) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'requisitions', id), {
                title: form.title,
                description: form.description,
                recommendation: form.recommendation,
                salaryMin: parseInt(salaryMinStr.replace(/\D/g, '')) || null,
                salaryMax: parseInt(salaryMaxStr.replace(/\D/g, '')) || null,
                workTypes: form.workTypes,
                requirements: form.requirements,
                assignedTo: assignedToId || null,
                assignedToName: assignedToName || null,
                updatedAt: Timestamp.now(),
                updatedBy: profile.uid,
            });
            toast.success('Заявка обновлена!');
            router.push(`/dashboard/requisitions/${id}`);
        } catch { toast.error('Ошибка сохранения'); }
        finally { setSaving(false); }
    };

    const renderListBlock = (
        title: string,
        field: keyof ReqData['requirements'],
        color: 'emerald' | 'purple'
    ) => {
        const items = form.requirements[field] as string[];
        const colorMap = {
            emerald: {
                wrap: 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-100',
                label: 'text-emerald-800',
                input: 'border-emerald-200/60 focus:ring-emerald-500/20',
                btn: 'text-emerald-700 hover:text-emerald-800 bg-emerald-100/50 hover:bg-emerald-200/50 border-emerald-200/50',
            },
            purple: {
                wrap: 'bg-gradient-to-r from-purple-50 to-pink-50 border-purple-100',
                label: 'text-purple-800',
                input: 'border-purple-200/60 focus:ring-purple-500/20',
                btn: 'text-purple-700 hover:text-purple-800 bg-purple-100/50 hover:bg-purple-200/50 border-purple-200/50',
            },
        };
        const c = colorMap[color];
        return (
            <div className={`p-6 rounded-2xl border shadow-sm ${c.wrap}`}>
                <label className={`block text-sm font-black uppercase tracking-wider mb-4 ${c.label}`}>{title}</label>
                <div className="flex flex-wrap gap-3">
                    {items.map((item, i) => (
                        <div key={i} className="flex gap-2 items-center w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.5rem)] min-w-[220px]">
                            <div className="flex-1 relative group">
                                <textarea
                                    value={item}
                                    onChange={e => updateList(field, i, e.target.value)}
                                    className={`w-full p-3 pr-10 border bg-white rounded-xl text-sm font-medium text-gray-800 leading-relaxed shadow-sm resize-none focus:outline-none focus:ring-4 ${c.input}`}
                                    rows={2}
                                />
                                <button onClick={() => removeFromList(field, i)}
                                    className="absolute right-2 top-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                    <div className="flex items-center w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.5rem)] min-w-[220px]">
                        <button onClick={() => addToList(field)}
                            className={`flex items-center gap-2 text-sm font-bold p-3 rounded-xl w-full justify-center transition-colors border h-fit ${c.btn}`}>
                            <Plus className="w-5 h-5" /> Добавить
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
    );

    return (
        <div className="w-full max-w-[1200px] mx-auto pb-20">
            {/* Back */}
            <button onClick={() => router.push(`/dashboard/requisitions/${id}`)}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors font-semibold mb-6 group">
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                Назад к заявке
            </button>

            <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-2xl shadow-md">
                    <Briefcase className="w-7 h-7" />
                </div>
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Редактирование заявки</h1>
                    <p className="text-gray-500 mt-1">Внесите необходимые изменения и сохраните</p>
                </div>
            </div>

            <div className="space-y-6">
                {/* Основная информация */}
                <div className="bg-white rounded-2xl border shadow-sm p-6 md:p-8 space-y-6">
                    <h2 className="text-base font-black text-gray-800 uppercase tracking-wider flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-500" /> Основная информация
                    </h2>

                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Название должности</label>
                        <input type="text" value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            className="w-full p-4 border rounded-xl font-bold text-xl text-gray-900 focus:outline-none focus:ring-4 focus:ring-blue-500/20" />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Описание вакансии</label>
                        <textarea value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            rows={5}
                            className="w-full p-4 border rounded-xl text-sm font-medium text-gray-800 leading-relaxed focus:outline-none focus:ring-4 focus:ring-blue-500/20 resize-none" />
                    </div>

                    {/* Salary */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Зарплата от (сум)</label>
                            <input type="text" value={salaryMinStr}
                                onChange={e => { const v = e.target.value.replace(/\D/g, ''); setSalaryMinStr(v ? Number(v).toLocaleString('ru-RU') : ''); }}
                                placeholder="100 000"
                                className="w-full p-4 border rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/20" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Зарплата до (сум)</label>
                            <input type="text" value={salaryMaxStr}
                                onChange={e => { const v = e.target.value.replace(/\D/g, ''); setSalaryMaxStr(v ? Number(v).toLocaleString('ru-RU') : ''); }}
                                placeholder="200 000"
                                className="w-full p-4 border rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/20" />
                        </div>
                    </div>

                    {/* Work types */}
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">Тип работы / График</label>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {PREDEFINED_WORK_TYPES.map(wt => (
                                <button key={wt} onClick={() => toggleWorkType(wt)}
                                    className={`px-4 py-2 text-sm rounded-xl border transition-all ${form.workTypes.includes(wt)
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                                        : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50'}`}>
                                    {wt}
                                </button>
                            ))}
                            {form.workTypes.filter(wt => !PREDEFINED_WORK_TYPES.includes(wt)).map(wt => (
                                <button key={wt} onClick={() => toggleWorkType(wt)}
                                    className="px-4 py-2 text-sm rounded-xl border bg-blue-600 border-blue-600 text-white shadow-md">
                                    {wt}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input type="text" value={customWorkType}
                                onChange={e => setCustomWorkType(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addCustomWorkType()}
                                placeholder="Свой вариант..."
                                className="flex-1 p-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                            <button onClick={addCustomWorkType} className="p-3 bg-white border rounded-xl hover:bg-gray-50 transition-colors">
                                <Plus className="w-5 h-5 text-gray-600" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Requirements */}
                <div className="space-y-4">
                    {renderListBlock('Обязанности', 'responsibilities', 'emerald')}
                    {renderListBlock('Опыт работы', 'experience', 'emerald')}
                    {renderListBlock('Образование', 'education', 'emerald')}
                    {renderListBlock('Личные качества (Soft Skills)', 'softSkills', 'purple')}
                    {renderListBlock('Подходящий психотип', 'psychoType', 'purple')}
                </div>

                {/* Условия + Направление */}
                <div className="bg-white rounded-2xl border shadow-sm p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Условия работы</label>
                        <textarea value={form.requirements.conditions}
                            onChange={e => setForm(f => ({ ...f, requirements: { ...f.requirements, conditions: e.target.value } }))}
                            rows={4}
                            className="w-full p-4 border rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/20 resize-none" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Направление / Специализация</label>
                        <textarea value={form.requirements.field}
                            onChange={e => setForm(f => ({ ...f, requirements: { ...f.requirements, field: e.target.value } }))}
                            rows={4}
                            className="w-full p-4 border rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/20 resize-none" />
                    </div>
                </div>

                {/* AI Recommendation */}
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-6 md:p-8">
                    <label className="block text-sm font-black text-indigo-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-indigo-600" /> Рекомендация для рекрутера
                        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 bg-indigo-200/50 text-indigo-700 rounded-md tracking-wider">Скрыто</span>
                    </label>
                    <textarea value={form.recommendation}
                        onChange={e => setForm(f => ({ ...f, recommendation: e.target.value }))}
                        rows={4}
                        className="w-full bg-white/80 border border-indigo-100 rounded-xl p-4 text-indigo-950 text-sm font-medium leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
                </div>

                {/* Recruiter assignment */}
                {['admin', 'hrd'].includes(profile?.role || '') && (
                    <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-6">
                        <label className="block text-sm font-black text-blue-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <User className="w-4 h-4" />
                            Ответственный рекрутер
                        </label>
                        <div className="relative">
                            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
                            <select
                                value={assignedToId}
                                onChange={e => {
                                    const uid = e.target.value;
                                    setAssignedToId(uid);
                                    const rec = recruiters.find(r => r.uid === uid);
                                    setAssignedToName(rec ? (rec.displayName || rec.email || uid) : '');
                                }}
                                className="select-field select-field-icon w-full"
                            >
                                <option value="">— Не назначено</option>
                                {recruiters.map(r => (
                                    <option key={r.uid} value={r.uid}>
                                        {r.displayName || r.email} ({r.role === 'hrd' ? 'HRD' : 'Рекрутер'})
                                    </option>
                                ))}
                            </select>
                        </div>
                        {assignedToId && (
                            <p className="text-xs text-blue-500 mt-2">✓ Назначен: <span className="font-bold">{assignedToName}</span></p>
                        )}
                    </div>
                )}

                {/* Save button */}
                <button onClick={handleSave} disabled={saving || !form.title.trim()}
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-lg rounded-xl shadow-lg shadow-blue-500/20 transition-all hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2">
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Сохранить изменения
                </button>
            </div>
        </div>
    );
}
