import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Sparkles, Users, FileText, BrainCircuit, ArrowRight, Zap, Target, LayoutDashboard, Database } from 'lucide-react';

export default function HomePage() {
    const t = useTranslations('Index');

    const features = [
        { icon: <FileText className="w-6 h-6 text-blue-500" />, title: "AI Заявки на подбор", desc: "Генерация профиля идеального кандидата по паре строк текста. Автоматическое составление требований и обязанностей." },
        { icon: <BrainCircuit className="w-6 h-6 text-purple-500" />, title: "Умный скрининг", desc: "Мгновенный анализ сотен резюме нейросетью. Выдача точного рейтинга совпадения навыков с требованиями вакансии." },
        { icon: <Sparkles className="w-6 h-6 text-yellow-500" />, title: "Кастомные тесты", desc: "Автоматическая генерация уникальных тестовых заданий и опросников под специфику конкретной должности." },
        { icon: <LayoutDashboard className="w-6 h-6 text-indigo-500" />, title: "Визуальная воронка (ERP)", desc: "Интуитивный Kanban-board для отслеживания статусов кандидатов. Прозрачный процесс от заявки на найм до оффера." },
        { icon: <Database className="w-6 h-6 text-emerald-500" />, title: "Единая база талантов", desc: "Структурированное хранение всех откликов, истории общения и результатов тестов в одном месте." },
        { icon: <Zap className="w-6 h-6 text-orange-500" />, title: "Шаблоны коммуникаций", desc: "Отправка приглашений на интервью, отказов и готовых Job Offer в один клик прямо из карточки кандидата." },
        { icon: <Users className="w-6 h-6 text-cyan-500" />, title: "Командная работа", desc: "Совместный доступ для нанимающих менеджеров. Обсуждения, оценки и согласование кандидатов." },
        { icon: <Target className="w-6 h-6 text-rose-500" />, title: "Точная аналитика", desc: "Отчеты по эффективности найма, времени закрытия вакансий и конверсии воронки в реальном времени." },
    ];

    return (
        <div className="flex flex-col items-center min-h-[calc(100vh-4rem)] p-4 sm:p-8 relative overflow-hidden bg-gradient-to-br from-blue-50/50 via-white to-purple-50/50">
            {/* Background decorations */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/20 blur-3xl filter pointer-events-none animate-pulse" style={{ animationDuration: '8s' }}></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-400/20 blur-3xl filter pointer-events-none animate-pulse" style={{ animationDuration: '10s' }}></div>

            <main className="flex flex-col items-center gap-10 text-center max-w-7xl relative z-10 w-full mt-12 pb-20">

                {/* Hero Section - Fixed Width/Height to prevent moving */}
                <div className="flex flex-col items-center max-w-4xl w-full">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-sm border border-gray-100 text-sm font-medium text-blue-600 mb-6 animate-fade-in-up">
                        <Sparkles className="w-4 h-4" />
                        <span>Платформа нового поколения</span>
                    </div>

                    <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-gray-900 tracking-tight leading-tight mb-6">
                        Ваш персональный <br />
                        <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">AI Рекрутер</span>
                    </h1>

                    <p className="text-lg sm:text-xl text-gray-600 max-w-3xl leading-relaxed mb-10 mx-auto px-4">
                        {t('description')}. Автоматизируйте рутину: от анализа резюме до генерации индивидуальных тестов и офферов. Нанимайте лучших быстрее.
                    </p>

                    <div className="flex justify-center w-full">
                        <Link href="/auth/login" className="flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-1 transition-all duration-300 w-full sm:w-auto text-lg group">
                            Начать работу
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>
                </div>

                {/* Features Grid - Expanded */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-16 w-full">
                    {features.map((f, i) => (
                        <div key={i} className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl border border-white/80 shadow-xl shadow-gray-200/40 hover:-translate-y-2 hover:shadow-2xl hover:bg-white transition-all duration-300 text-left flex flex-col items-start gap-4 h-full">
                            <div className="p-3 bg-gray-50/80 rounded-xl shadow-sm border border-gray-100 inline-block">
                                {f.icon}
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-black text-gray-900 mb-2.5 leading-tight">{f.title}</h3>
                                <p className="text-sm text-gray-600 leading-relaxed font-medium">{f.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>

            </main>
        </div>
    );
}
