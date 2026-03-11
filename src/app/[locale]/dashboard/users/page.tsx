"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/db';
import { auth } from '@/lib/firebase';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { collection, query, where, getDocs, addDoc, Timestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Users, Mail, Briefcase, Plus, Loader2, Edit2, Trash2, X, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Invite {
    id: string;
    email: string;
    role: string;
    companyId: string;
    createdAt: Timestamp;
}

interface UserData {
    uid: string;
    email: string;
    role: string;
    displayName?: string;
}

export default function UsersPage() {
    const { profile } = useAuth();
    const [users, setUsers] = useState<UserData[]>([]);
    const [invites, setInvites] = useState<Invite[]>([]);
    const [loading, setLoading] = useState(true);

    // Add form
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState('recruiter');
    const [adding, setAdding] = useState(false);

    // Edit state
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editRole, setEditRole] = useState('');

    useEffect(() => {
        const fetchUsers = async () => {
            if (!profile || profile.role !== 'admin') return;
            try {
                // Get active users
                const uQuery = query(collection(db, 'users'), where('companyId', '==', profile.companyId));
                const uSnap = await getDocs(uQuery);
                const usrs: UserData[] = [];
                uSnap.forEach(d => {
                    const data = d.data() as UserData;
                    usrs.push({ uid: d.id, ...data });
                });
                setUsers(usrs);

                // Get pending invites
                const iQuery = query(collection(db, 'invites'), where('companyId', '==', profile.companyId));
                const iSnap = await getDocs(iQuery);
                const invs: Invite[] = [];
                iSnap.forEach(d => invs.push({ id: d.id, ...d.data() } as Invite));
                setInvites(invs);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchUsers();
    }, [profile]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEmail || !profile?.companyId) return;
        setAdding(true);
        try {
            // 1. Save invite to Firestore (role will be assigned when user clicks link and registers)
            const inviteData = {
                email: newEmail.toLowerCase(),
                role: newRole,
                companyId: profile.companyId,
                createdAt: Timestamp.now()
            };
            const docRef = await addDoc(collection(db, 'invites'), inviteData);
            setInvites([{ id: docRef.id, ...inviteData } as Invite, ...invites]);

            // 2. Firebase sends the invite email for FREE via sendSignInLinkToEmail
            // No server, no API keys restrictions — runs entirely client-side
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rec-a-hr-erp-92837482.web.app';
            await sendSignInLinkToEmail(auth, newEmail.toLowerCase(), {
                url: `${appUrl}/ru/auth/login?inviteId=${docRef.id}&email=${encodeURIComponent(newEmail.toLowerCase())}`,
                handleCodeInApp: true,
            });

            setNewEmail('');
            toast.success(`Приглашение отправлено! ${newEmail} получит письмо со ссылкой для входа.`);
        } catch (err: any) {
            console.error(err);
            toast.error('Ошибка: ' + (err.message || 'Не удалось отправить приглашение'));
        } finally {
            setAdding(false);
        }
    };

    const handleDeleteUser = async (uid: string) => {
        if (!confirm('Вы уверены, что хотите удалить этого пользователя? Он потеряет доступ к системе.')) return;
        try {
            await deleteDoc(doc(db, 'users', uid));
            setUsers(users.filter(u => u.uid !== uid));
            toast.success('Пользователь удален');
        } catch (err) {
            console.error(err);
            toast.error('Ошибка удаления');
        }
    };

    const handleDeleteInvite = async (id: string) => {
        if (!confirm('Отменить приглашение?')) return;
        try {
            await deleteDoc(doc(db, 'invites', id));
            setInvites(invites.filter(i => i.id !== id));
            toast.success('Приглашение отменено');
        } catch (err) {
            console.error(err);
            toast.error('Ошибка удаления');
        }
    };

    const handleEditStart = (user: UserData) => {
        setEditingUserId(user.uid);
        setEditName(user.displayName || '');
        setEditRole(user.role);
    };

    const handleEditSave = async (uid: string) => {
        try {
            await updateDoc(doc(db, 'users', uid), {
                displayName: editName,
                role: editRole
            });
            setUsers(users.map(u => u.uid === uid ? { ...u, displayName: editName, role: editRole } : u));
            setEditingUserId(null);
            toast.success('Данные пользователя обновлены');
        } catch (err) {
            console.error(err);
            toast.error('Ошибка сохранения');
        }
    };

    const roleNames: Record<string, string> = {
        'admin': 'Администратор',
        'hrd': 'HR Директор',
        'manager': 'Руководитель',
        'recruiter': 'Рекрутер',
        'requester': 'Заявитель'
    };

    if (profile?.role !== 'admin') {
        return <div className="p-8 text-center text-red-500">У вас нет прав для просмотра этой страницы.</div>;
    }

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                    <Users className="w-8 h-8 text-blue-600" />
                    Сотрудники компании
                </h1>
                <p className="text-gray-500 mt-2">Управление доступом и ролями сотрудников в системе.</p>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Пригласить сотрудника</h2>
                <form onSubmit={handleInvite} className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                        <input
                            type="email"
                            required
                            placeholder="Email сотрудника"
                            value={newEmail}
                            onChange={e => setNewEmail(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div className="w-full md:w-64 relative">
                        <Briefcase className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <select
                            value={newRole}
                            onChange={e => setNewRole(e.target.value)}
                            className="select-field select-field-icon w-full"
                        >
                            {Object.entries(roleNames).map(([val, label]) => (
                                <option key={val} value={val}>{label}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="submit"
                        disabled={adding}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors flex items-center gap-2 justify-center disabled:opacity-70"
                    >
                        {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                        Отправить
                    </button>
                </form>
            </div>

            {loading ? (
                <div className="flex justify-center p-10"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
            ) : (
                <div className="grid grid-cols-1 gap-8">
                    {/* Активные пользователи */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Briefcase className="w-5 h-5 text-gray-500" />
                                Активные пользователи
                            </h3>
                        </div>
                        <ul className="divide-y divide-gray-100">
                            {users.map(u => (
                                <li key={u.uid} className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-gray-50 transition-colors">
                                    {editingUserId === u.uid ? (
                                        <div className="flex-1 flex flex-col md:flex-row gap-3 w-full">
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm w-full md:w-auto flex-1"
                                                placeholder="Имя пользователя"
                                            />
                                            <div className="relative w-full md:w-48">
                                                <Briefcase className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                <select
                                                    value={editRole}
                                                    onChange={e => setEditRole(e.target.value)}
                                                    className="select-field select-field-icon w-full"
                                                >
                                                    {Object.entries(roleNames).map(([val, label]) => (
                                                        <option key={val} value={val}>{label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleEditSave(u.uid)} className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200">
                                                    <Check className="w-5 h-5" />
                                                </button>
                                                <button onClick={() => setEditingUserId(null)} className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                                                    <X className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div>
                                                <p className="font-semibold text-gray-900">{u.displayName || 'Без имени'}</p>
                                                <p className="text-sm text-gray-500">{u.email}</p>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold uppercase tracking-wider">
                                                    {roleNames[u.role] || u.role}
                                                </span>
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleEditStart(u)} className="p-2 text-gray-400 hover:text-blue-600 transition-colors" title="Редактировать">
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    {u.uid !== profile.uid && (
                                                        <button onClick={() => handleDeleteUser(u.uid)} className="p-2 text-gray-400 hover:text-red-600 transition-colors" title="Удалить">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Ожидающие инвайты */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Mail className="w-5 h-5 text-gray-500" />
                                Ожидающие приглашения
                            </h3>
                        </div>
                        {invites.length === 0 ? (
                            <div className="p-8 text-center text-gray-500 text-sm">
                                Нет ожидающих приглашений
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {invites.map(i => (
                                    <li key={i.id} className="p-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                                        <p className="font-medium text-gray-700">{i.email}</p>
                                        <div className="flex items-center gap-4">
                                            <span className="px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full text-xs font-semibold uppercase tracking-wider">
                                                {roleNames[i.role] || i.role}
                                            </span>
                                            <button onClick={() => handleDeleteInvite(i.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors" title="Отменить">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
