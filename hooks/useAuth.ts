import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserRole } from '../types';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(UserRole.OPERATOR);
  const [userName, setUserName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {

      if (currentUser) {
        const adminEmail = "ahmed.evolt@gmail.com";
        const emailKey = currentUser.email!.toLowerCase();
        const isMasterAdmin = emailKey === adminEmail.toLowerCase();
        
        try {
          const userDocRef = doc(db, "users", emailKey);
          const userDoc = await getDoc(userDocRef);
          
          let assignedRole: UserRole | null = null;
          let profileName = '';
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            assignedRole = (userData.roles && userData.roles.length > 0) ? userData.roles[0] : (userData.role as UserRole);
            profileName = userData.name || currentUser.displayName || '';
            
            // Sync status and UID if needed
            const updates: any = {};
            if (userData.status !== 'Active') updates.status = 'Active';
            if (userData.uid !== currentUser.uid) updates.uid = currentUser.uid;
            
            if (Object.keys(updates).length > 0) {
              await updateDoc(userDocRef, updates);
            }
          } else if (isMasterAdmin) {
            assignedRole = UserRole.ADMIN;
            profileName = "Master Admin";
            await setDoc(userDocRef, { 
              email: emailKey, 
              role: UserRole.ADMIN, 
              status: 'Active', 
              uid: currentUser.uid,
              name: profileName,
              invitedAt: new Date().toISOString() 
            });
          } else {
            await auth.signOut();
            setLoading(false);
            return;
          }
          
          if (assignedRole) {
            setRole(assignedRole);
            setUserName(profileName);
            setUser(currentUser);
          }
        } catch (error) {
          console.error("Auth error:", error);
          if (isMasterAdmin) {
            setUser(currentUser);
            setRole(UserRole.ADMIN);
          }
        }
      } else {
        setUser(null);
        setUserName('');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await auth.signOut();
  };

  return { user, role, userName, loading, logout };
};
