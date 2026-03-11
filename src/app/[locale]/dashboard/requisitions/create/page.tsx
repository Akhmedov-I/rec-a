"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/i18n/routing';
import { db, Requisition, getRecruiters, UserProfile } from '@/lib/db';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { FileText, Type, Upload, Loader2, Plus, Trash2, Edit2, Check, ArrowLeft, Sparkles, User, Briefcase, Lightbulb, Shield } from 'lucide-react';
import { toast } from 'react-hot-toast';

const PREDEFINED_WORK_TYPES = ['5/2', '6/1', '2/2', 'Вахта', 'Удаленка', 'Гибрид'];

export default function CreateRequisitionPage() {
    const { profile, companyDescription } = useAuth();
    const router = useRouter();
    const [mode, setMode] = useState<'text' | 'file' | null>(null);
    const [loading, setLoading] = useState(false);

    // Form state pre-generation
    const [rawText, setRawText] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [companyInfo, setCompanyInfo] = useState('');
    const [isEditingCompanyInfo, setIsEditingCompanyInfo] = useState(false);

    const [workTypes, setWorkTypes] = useState<string[]>([]);
    const [customWorkType, setCustomWorkType] = useState('');
    const [salaryMin, setSalaryMin] = useState('');
    const [salaryMax, setSalaryMax] = useState('');

    // Recruiter assignment
    const [recruiters, setRecruiters] = useState<UserProfile[]>([]);
    const [assignedToId, setAssignedToId] = useState<string>('');
    const [assignedToName, setAssignedToName] = useState<string>('');

    const [generatedData, setGeneratedData] = useState<Partial<Requisition> | null>(null);

    useEffect(() => {
        if (companyDescription && !companyInfo && !isEditingCompanyInfo) {
            setCompanyInfo(companyDescription);
        }
    }, [companyDescription, companyInfo, isEditingCompanyInfo]);

    // Load company recruiters for admin/hrd
    useEffect(() => {
        if (!profile) return;
        const companyId = profile.companyId;
        if (['admin', 'hrd'].includes(profile.role) && companyId) {
            getRecruiters(companyId).then(list => {
                setRecruiters(list);
                // Pre-select self if HRD
                if (profile.role === 'hrd') {
                    setAssignedToId(profile.uid);
                    setAssignedToName(profile.displayName || profile.email || profile.uid);
                }
            });
        } else if (profile.role === 'recruiter') {
            // Auto-assign self
            setAssignedToId(profile.uid);
            setAssignedToName(profile.displayName || profile.email || profile.uid);
        }
    }, [profile]);

    const toggleWorkType = (wt: string) => {
        if (workTypes.includes(wt)) {
            setWorkTypes(workTypes.filter(t => t !== wt));
        } else {
            setWorkTypes([...workTypes, wt]);
        }
    };

    const addCustomWorkType = () => {
        if (customWorkType.trim() && !workTypes.includes(customWorkType.trim())) {
            setWorkTypes([...workTypes, customWorkType.trim()]);
            setCustomWorkType('');
        }
    };

    const handleGenerateText = async () => {
        if (!rawText.trim()) return;
        setLoading(true);
        try {
            const response = await fetch('/api/requisition/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'text',
                    content: rawText,
                    companyInfo,
                    workTypes,
                    salaryMin: parseInt(salaryMin.replace(/\D/g, '')) || undefined,
                    salaryMax: parseInt(salaryMax.replace(/\D/g, '')) || undefined
                })
            });
            const data = await response.json();
            if (response.ok) {
                setGeneratedData(data.result);
                toast.success('Заявка успешно сгенерирована!');
            } else {
                toast.error('Ошибка генерации: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            toast.error('Ошибка сети при генерации');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateFile = async () => {
        if (!file) return;
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('companyInfo', companyInfo);
            workTypes.forEach(wt => formData.append('workTypes[]', wt));
            if (salaryMin) formData.append('salaryMin', salaryMin.replace(/\D/g, ''));
            if (salaryMax) formData.append('salaryMax', salaryMax.replace(/\D/g, ''));

            const response = await fetch('/api/requisition/generate', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (response.ok) {
                setGeneratedData(data.result);
                toast.success('Заявка успешно сгенерирована из файла!');
            } else {
                toast.error('Ошибка генерации: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            toast.error('Ошибка сети при генерации');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!profile || !generatedData) return;
        setLoading(true);
        try {
            const newReq: Omit<Requisition, 'id'> = {
                companyId: profile.companyId || profile.uid,
                title: generatedData.title || 'Новая вакансия',
                description: generatedData.description || '',
                requirements: {
                    education: generatedData.requirements?.education || [],
                    experience: generatedData.requirements?.experience || [],
                    field: generatedData.requirements?.field || '',
                    softSkills: generatedData.requirements?.softSkills || [],
                    psychoType: generatedData.requirements?.psychoType || [],
                    responsibilities: generatedData.requirements?.responsibilities || [],
                    conditions: generatedData.requirements?.conditions || '',
                },
                workTypes: workTypes,
                salaryMin: parseInt(salaryMin.replace(/\D/g, '')) || null,
                salaryMax: parseInt(salaryMax.replace(/\D/g, '')) || null,
                recommendation: generatedData.recommendation || '',
                aiGenerated: true,
                status: 'open',
                createdBy: profile.uid,
                assignedTo: assignedToId || undefined,
                assignedToName: assignedToName || undefined,
                createdAt: Timestamp.now(),
            };

            const docRef = await addDoc(collection(db, 'requisitions'), newReq);
            toast.success('Заявка сохранена!');
            router.push(`/dashboard/requisitions/${docRef.id}`);
        } catch (error) {
            console.error('Ошибка сохранения:', error);
            toast.error('Ошибка сохранения заявки');
            setLoading(false);
        }
    };

    const handleTextareaResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
    };

    const renderListInput = (
        title: string,
        items: string[] = [],
        field: keyof NonNullable<Requisition['requirements']>
    ) => {
        // Ensure items is always an array, sometimes AI might return a string despite prompt
        const safeItems = Array.isArray(items) ? items : (typeof items === 'string' ? [items] : []);

        const handleItemChange = (index: number, value: string) => {
            if (!generatedData) return;
            const newItems = [...safeItems];
            newItems[index] = value;
            setGeneratedData({
                ...generatedData,
                requirements: {
                    ...generatedData.requirements,
                    [field]: newItems
                } as any
            });
        };

        const handleRemoveItem = (index: number) => {
            if (!generatedData) return;
            const newItems = safeItems.filter((_, i) => i !== index);
            setGeneratedData({
                ...generatedData,
                requirements: {
                    ...generatedData.requirements,
                    [field]: newItems
                } as any
            });
        };

        const handleAddItem = () => {
            if (!generatedData) return;
            setGeneratedData({
                ...generatedData,
                requirements: {
                    ...generatedData.requirements,
                    [field]: [...safeItems, '']
                } as any
            });
        };

        return (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-6 rounded-2xl border border-emerald-100 h-full flex flex-col shadow-sm">
                <label className="block text-sm font-black text-emerald-800 uppercase tracking-wider mb-4">{title}</label>
                <div className="flex flex-wrap gap-3 flex-1">
                    {safeItems.map((item, index) => (
                        <div key={index} className="flex gap-2 items-center w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.5rem)] xl:w-[calc(25%-0.5rem)] min-w-[250px]">
                            <div className="flex-1 w-full relative group">
                                <textarea
                                    value={item}
                                    onChange={(e) => {
                                        handleItemChange(index, e.target.value);
                                        handleTextareaResize(e);
                                    }}
                                    className="w-full p-3 pr-10 border border-emerald-200/60 bg-white rounded-xl focus:ring-4 focus:ring-emerald-500/20 text-sm font-medium text-gray-800 leading-relaxed overflow-hidden shadow-sm hover:border-emerald-300 transition-colors"
                                    style={{
                                        minHeight: '44px',
                                        height: 'auto'
                                    }}
                                    ref={(el) => {
                                        if (el) {
                                            el.style.height = 'auto';
                                            el.style.height = el.scrollHeight + 'px';
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => handleRemoveItem(index)}
                                    className="absolute right-2 top-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                    <div className="flex items-center w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.5rem)] xl:w-[calc(25%-0.5rem)] min-w-[250px]">
                        <button
                            onClick={handleAddItem}
                            className="flex items-center gap-2 text-sm text-emerald-700 hover:text-emerald-800 font-bold p-3 bg-emerald-100/50 hover:bg-emerald-200/50 rounded-xl w-full justify-center transition-colors border border-emerald-200/50 h-fit"
                        >
                            <Plus className="w-5 h-5" /> Добавить
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="w-full max-w-[1400px] mx-auto pb-20 animate-fade-in-up">
            <div className="mb-8">
                <button
                    onClick={() => router.push('/dashboard/requisitions')}
                    className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors font-semibold mb-5 group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Заявки на подбор
                </button>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Создание заявки на подбор</h1>
                <p className="text-gray-500 mt-2 text-lg">AI поможет сформировать подробные требования</p>
            </div>

            {!generatedData ? (
                <div className="bg-white p-6 md:p-10 rounded-[2rem] shadow-xl shadow-gray-200/40 border border-gray-100 space-y-10">

                    {/* Company Info block */}
                    <div className="bg-gradient-to-br from-gray-50 to-white p-6 rounded-2xl border border-gray-100 relative shadow-inner">
                        <div className="flex justify-between items-start mb-4">
                            <label className="block text-base font-bold text-gray-800">Информация о компании</label>
                            <button
                                onClick={() => setIsEditingCompanyInfo(!isEditingCompanyInfo)}
                                className="text-blue-600 hover:text-blue-800 p-2 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
                                title={isEditingCompanyInfo ? "Завершить редактирование" : "Редактировать"}
                            >
                                {isEditingCompanyInfo ? <Check className="w-5 h-5" /> : <Edit2 className="w-5 h-5" />}
                            </button>
                        </div>
                        <p className="text-sm text-gray-500 mb-4">Эти данные будут использованы ИИ для более точного формирования описания вакансии и преимуществ работы.</p>

                        {isEditingCompanyInfo ? (
                            <textarea
                                value={companyInfo}
                                onChange={(e) => setCompanyInfo(e.target.value)}
                                rows={4}
                                className="w-full p-4 border rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white shadow-sm"
                                placeholder="Опишите компанию, преимущества, сферу деятельности..."
                            />
                        ) : (
                            <div className="text-gray-700 text-base whitespace-pre-wrap bg-white p-4 rounded-xl border border-gray-100 min-h-[100px]">
                                {companyInfo || <span className="text-gray-400 italic">Информация о компании не задана. ИИ будет генерировать заявку без учета специфики вашей компании.</span>}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-gray-100">
                        {/* Work Types */}
                        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 shadow-inner">
                            <label className="block text-base font-bold text-gray-800 mb-4">Тип работы / График</label>
                            <div className="flex flex-wrap gap-2 mb-4">
                                {PREDEFINED_WORK_TYPES.map(wt => (
                                    <button
                                        key={wt}
                                        onClick={() => toggleWorkType(wt)}
                                        className={`px-4 py-2 text-sm rounded-xl border transition-all ${workTypes.includes(wt)
                                            ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/30'
                                            : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
                                            }`}
                                    >
                                        {wt}
                                    </button>
                                ))}
                                {workTypes.filter(wt => !PREDEFINED_WORK_TYPES.includes(wt)).map(wt => (
                                    <button
                                        key={wt}
                                        onClick={() => toggleWorkType(wt)}
                                        className="px-4 py-2 text-sm rounded-xl border bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/30"
                                    >
                                        {wt}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={customWorkType}
                                    onChange={e => setCustomWorkType(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addCustomWorkType()}
                                    placeholder="Свой вариант..."
                                    className="flex-1 p-3 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500/20"
                                />
                                <button onClick={addCustomWorkType} className="p-3 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors shadow-sm">
                                    <Plus className="w-5 h-5 text-gray-600" />
                                </button>
                            </div>
                        </div>

                        {/* Salary */}
                        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 shadow-inner">
                            <label className="block text-base font-bold text-gray-800 mb-4">Заработная плата (сум)</label>
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">От</span>
                                    <input
                                        type="text"
                                        value={salaryMin}
                                        onChange={e => {
                                            const val = e.target.value.replace(/\D/g, '');
                                            setSalaryMin(val ? Number(val).toLocaleString('ru-RU') : '');
                                        }}
                                        placeholder="100 000"
                                        className="w-full p-4 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500/20 font-medium"
                                    />
                                </div>
                                <div className="flex-1">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">До</span>
                                    <input
                                        type="text"
                                        value={salaryMax}
                                        onChange={e => {
                                            const val = e.target.value.replace(/\D/g, '');
                                            setSalaryMax(val ? Number(val).toLocaleString('ru-RU') : '');
                                        }}
                                        placeholder="150 000"
                                        className="w-full p-4 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500/20 font-medium"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Mode selection */}
                    <div className="pt-8 border-t border-gray-100">
                        <label className="block text-base font-bold text-gray-800 mb-4">Описание вакансии</label>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <button
                                onClick={() => setMode('text')}
                                className={`p-6 border-2 rounded-2xl text-center transition-all ${mode === 'text' ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-500/10 scale-[1.02]' : 'border-gray-100 hover:border-blue-300 bg-white hover:bg-gray-50'}`}
                            >
                                <Type className={`mx-auto h-8 w-8 mb-3 ${mode === 'text' ? 'text-blue-600' : 'text-gray-400'}`} />
                                <h3 className="font-bold text-gray-900">Описать текстом</h3>
                                <p className="text-sm text-gray-500 mt-1">Напишите пару строк о вакансии</p>
                            </button>
                            <button
                                onClick={() => setMode('file')}
                                className={`p-6 border-2 rounded-2xl text-center transition-all ${mode === 'file' ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-500/10 scale-[1.02]' : 'border-gray-100 hover:border-blue-300 bg-white hover:bg-gray-50'}`}
                            >
                                <FileText className={`mx-auto h-8 w-8 mb-3 ${mode === 'file' ? 'text-blue-600' : 'text-gray-400'}`} />
                                <h3 className="font-bold text-gray-900">Загрузить файл</h3>
                                <p className="text-sm text-gray-500 mt-1">PDF, Word или скриншот</p>
                            </button>
                        </div>

                        {mode && (
                            <div className="space-y-6 animate-fade-in-up">
                                {mode === 'text' ? (
                                    <div>
                                        <textarea
                                            value={rawText}
                                            onChange={(e) => setRawText(e.target.value)}
                                            rows={5}
                                            className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-gray-50 focus:bg-white transition-all resize-y"
                                            placeholder="Например: Ищем frontend разработчика с опытом React от 2 лет..."
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <div className="flex items-center justify-center w-full">
                                            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-blue-200 border-dashed rounded-2xl cursor-pointer bg-blue-50/50 hover:bg-blue-50 transition-colors">
                                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                    <Upload className="w-10 h-10 mb-4 text-blue-500" />
                                                    <p className="mb-2 text-base text-gray-700"><span className="font-bold">Нажмите для загрузки</span> или перетащите файл</p>
                                                    <p className="text-sm text-gray-500 font-medium">{file ? file.name : 'Поддерживаются: PDF, DOCX, JPG, PNG'}</p>
                                                </div>
                                                <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                                            </label>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={mode === 'text' ? handleGenerateText : handleGenerateFile}
                                    disabled={loading || (mode === 'text' ? !rawText.trim() : !file)}
                                    className="w-full flex justify-center items-center py-5 px-4 border border-transparent rounded-2xl shadow-xl shadow-blue-500/30 text-lg font-black text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:shadow-none transition-all hover:-translate-y-1"
                                >
                                    {loading ? <Loader2 className="w-6 h-6 animate-spin mr-3" /> : <Sparkles className="w-6 h-6 mr-3" />}
                                    Сгенерировать заявку с AI
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-6 animate-fade-in-up">
                    <button
                        onClick={() => setGeneratedData(null)}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors font-bold mb-2 bg-white px-5 py-3 rounded-xl border border-gray-200 shadow-sm w-fit hover:shadow-md"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        Изменить исходные данные
                    </button>

                    <div className="bg-white p-6 md:p-10 rounded-[2rem] shadow-xl shadow-gray-200/40 border border-gray-100 space-y-10">
                        <div>
                            <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-100">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-2xl shadow-md">
                                        <Sparkles className="w-7 h-7" />
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black text-gray-900">Результат генерации</h2>
                                        <p className="text-gray-500 font-medium mt-1">Отредактируйте данные перед сохранением</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-12">
                                {/* Основная информация */}
                                <div className="space-y-4">
                                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100 shadow-sm">
                                        <label className="block text-xs font-black text-blue-700 uppercase tracking-widest mb-3">Название должности</label>
                                        <input
                                            type="text"
                                            value={generatedData.title}
                                            onChange={(e) => setGeneratedData({ ...generatedData, title: e.target.value })}
                                            className="w-full p-4 border border-blue-200 bg-white rounded-xl focus:ring-4 focus:ring-blue-500/20 font-black text-2xl text-gray-900 transition-all shadow-sm"
                                        />
                                    </div>

                                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100 shadow-sm">
                                        <label className="block text-xs font-black text-blue-700 uppercase tracking-widest mb-3">Описание вакансии</label>
                                        <textarea
                                            value={generatedData.description}
                                            onChange={(e) => {
                                                setGeneratedData({ ...generatedData, description: e.target.value });
                                                handleTextareaResize(e);
                                            }}
                                            className="w-full p-4 border border-blue-200 bg-white rounded-xl focus:ring-4 focus:ring-blue-500/20 transition-all text-base font-medium text-gray-800 leading-relaxed overflow-hidden shadow-sm"
                                            style={{ minHeight: '80px', height: 'auto' }}
                                            ref={(el) => {
                                                if (el) {
                                                    el.style.height = 'auto';
                                                    el.style.height = el.scrollHeight + 'px';
                                                }
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Требования и обязанности */}
                                <div className="space-y-4">
                                    {renderListInput('Обязанности', (generatedData.requirements?.responsibilities as unknown as string[]) || [], 'responsibilities')}
                                    {renderListInput('Опыт работы', (generatedData.requirements?.experience as unknown as string[]) || [], 'experience')}
                                    {renderListInput('Образование', (generatedData.requirements?.education as unknown as string[]) || [], 'education')}
                                </div>

                                {/* Личностные качества */}
                                <div className="space-y-4 pt-4 border-t border-gray-100">
                                    {/* Переопределяем стили для этого блока напрямую */}
                                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-2xl border border-purple-100 h-full flex flex-col shadow-sm">
                                        <label className="block text-sm font-black text-purple-800 uppercase tracking-wider mb-4">Личные качества (Soft Skills)</label>
                                        <div className="flex flex-wrap gap-3 flex-1">
                                            {((generatedData.requirements?.softSkills as unknown as string[]) || []).map((item, index) => (
                                                <div key={index} className="flex gap-2 items-center w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.5rem)] xl:w-[calc(25%-0.5rem)] min-w-[250px]">
                                                    <div className="flex-1 w-full relative group">
                                                        <textarea
                                                            value={item}
                                                            onChange={(e) => {
                                                                const newItems = [...(generatedData.requirements?.softSkills as unknown as string[] || [])];
                                                                newItems[index] = e.target.value;
                                                                setGeneratedData({ ...generatedData, requirements: { ...generatedData.requirements, softSkills: newItems } as any });
                                                                handleTextareaResize(e);
                                                            }}
                                                            className="w-full p-3 pr-10 border border-purple-200/60 bg-white rounded-xl focus:ring-4 focus:ring-purple-500/20 text-sm font-medium text-gray-800 leading-relaxed overflow-hidden shadow-sm hover:border-purple-300 transition-colors"
                                                            style={{ minHeight: '44px', height: 'auto' }}
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                const newItems = (generatedData.requirements?.softSkills as unknown as string[] || []).filter((_, i) => i !== index);
                                                                setGeneratedData({ ...generatedData, requirements: { ...generatedData.requirements, softSkills: newItems } as any });
                                                            }}
                                                            className="absolute right-2 top-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="flex items-center w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.5rem)] xl:w-[calc(25%-0.5rem)] min-w-[250px]">
                                                <button
                                                    onClick={() => setGeneratedData({ ...generatedData, requirements: { ...generatedData.requirements, softSkills: [...(generatedData.requirements?.softSkills as unknown as string[] || []), ''] } as any })}
                                                    className="flex items-center gap-2 text-sm text-purple-700 hover:text-purple-800 font-bold p-3 bg-purple-100/50 hover:bg-purple-200/50 rounded-xl w-full justify-center transition-colors border border-purple-200/50 h-fit"
                                                >
                                                    <Plus className="w-5 h-5" /> Добавить
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-2xl border border-purple-100 h-full flex flex-col shadow-sm">
                                        <label className="block text-sm font-black text-purple-800 uppercase tracking-wider mb-4">Подходящий психотип</label>
                                        <div className="flex flex-wrap gap-3 flex-1">
                                            {((generatedData.requirements?.psychoType as unknown as string[]) || []).map((item, index) => (
                                                <div key={index} className="flex gap-2 items-center w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.5rem)] xl:w-[calc(25%-0.5rem)] min-w-[250px]">
                                                    <div className="flex-1 w-full relative group">
                                                        <textarea
                                                            value={item}
                                                            onChange={(e) => {
                                                                const newItems = [...(generatedData.requirements?.psychoType as unknown as string[] || [])];
                                                                newItems[index] = e.target.value;
                                                                setGeneratedData({ ...generatedData, requirements: { ...generatedData.requirements, psychoType: newItems } as any });
                                                                handleTextareaResize(e);
                                                            }}
                                                            className="w-full p-3 pr-10 border border-purple-200/60 bg-white rounded-xl focus:ring-4 focus:ring-purple-500/20 text-sm font-medium text-gray-800 leading-relaxed overflow-hidden shadow-sm hover:border-purple-300 transition-colors"
                                                            style={{ minHeight: '44px', height: 'auto' }}
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                const newItems = (generatedData.requirements?.psychoType as unknown as string[] || []).filter((_, i) => i !== index);
                                                                setGeneratedData({ ...generatedData, requirements: { ...generatedData.requirements, psychoType: newItems } as any });
                                                            }}
                                                            className="absolute right-2 top-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="flex items-center w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.5rem)] xl:w-[calc(25%-0.5rem)] min-w-[250px]">
                                                <button
                                                    onClick={() => setGeneratedData({ ...generatedData, requirements: { ...generatedData.requirements, psychoType: [...(generatedData.requirements?.psychoType as unknown as string[] || []), ''] } as any })}
                                                    className="flex items-center gap-2 text-sm text-purple-700 hover:text-purple-800 font-bold p-3 bg-purple-100/50 hover:bg-purple-200/50 rounded-xl w-full justify-center transition-colors border border-purple-200/50 h-fit"
                                                >
                                                    <Plus className="w-5 h-5" /> Добавить
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Рекомендации ИИ */}
                                <div>
                                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100/60 rounded-2xl p-5 shadow-inner relative overflow-hidden">
                                        <div className="flex justify-between items-center mb-3 relative z-10">
                                            <h3 className="text-sm font-black text-indigo-900 flex items-center gap-2 uppercase tracking-wider">
                                                <Lightbulb className="w-4 h-4 text-indigo-600" />
                                                Рекомендация для рекрутера
                                            </h3>
                                            <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-200/50 text-indigo-700 rounded-md uppercase tracking-wider">Скрыто</span>
                                        </div>
                                        <textarea
                                            value={generatedData.recommendation || ''}
                                            onChange={(e) => {
                                                setGeneratedData({ ...generatedData, recommendation: e.target.value });
                                                handleTextareaResize(e);
                                            }}
                                            className="w-full bg-white/80 border border-indigo-100 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 rounded-xl p-4 text-indigo-950 font-medium text-sm leading-relaxed relative z-10 overflow-hidden transition-all shadow-sm"
                                            style={{ minHeight: '100px', height: 'auto' }}
                                            placeholder="Здесь будут рекомендации ИИ по стратегии найма..."
                                            ref={(el) => {
                                                if (el) {
                                                    el.style.height = 'auto';
                                                    el.style.height = el.scrollHeight + 'px';
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 mt-6 border-t border-gray-100 space-y-4">

                            {/* Recruiter assignment — only for admin & hrd */}
                            {['admin', 'hrd'].includes(profile?.role || '') && (
                                <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-5">
                                    <label className="block text-xs font-black text-blue-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <User className="w-4 h-4" />
                                        Ответственный рекрутер
                                    </label>
                                    <p className="text-xs text-blue-600 mb-3">Назначьте рекрутера, ответственного за подбор по этой вакансии.</p>
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
                                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-blue-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 appearance-none"
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

                            {/* Auto-assigned badge for recruiter role */}
                            {profile?.role === 'recruiter' && (
                                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                                    <User className="w-4 h-4" />
                                    <span>Ответственный рекрутер: <span className="font-bold">{profile.displayName || profile.email}</span> (вы)</span>
                                </div>
                            )}

                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="w-full py-4 px-4 border border-transparent rounded-xl shadow-lg shadow-green-500/20 text-lg font-black text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 transition-all hover:-translate-y-0.5 flex justify-center items-center"
                            >
                                {loading ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : <Check className="w-6 h-6 mr-2" />}
                                Сохранить заявку
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
