"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserProfile, UserProfile, db } from "@/lib/db";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "@/i18n/routing";

interface AuthContextType {
    user: User | null;
    profile: UserProfile | null;
    companyName: string | null;
    companyDescription: string | null;
    setCompanyName: (name: string | null) => void;
    setCompanyDescription: (desc: string | null) => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    companyName: null,
    companyDescription: null,
    setCompanyName: () => { },
    setCompanyDescription: () => { },
    loading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [companyName, setCompanyName] = useState<string | null>(null);
    const [companyDescription, setCompanyDescription] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                const userProfile = await getUserProfile(currentUser.uid);
                setProfile(userProfile);
                if (userProfile?.companyId) {
                    try {
                        const compDoc = await getDoc(doc(db, 'companies', userProfile.companyId));
                        if (compDoc.exists()) {
                            setCompanyName(compDoc.data().name || null);
                            setCompanyDescription(compDoc.data().description || null);
                        }
                    } catch (e) {
                        console.error(e);
                    }
                } else {
                    setCompanyName(null);
                    setCompanyDescription(null);
                }
            } else {
                setProfile(null);
                setCompanyName(null);
                setCompanyDescription(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <AuthContext.Provider value={{ user, profile, companyName, companyDescription, setCompanyName, setCompanyDescription, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
