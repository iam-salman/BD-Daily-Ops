
import React, { useState, useEffect } from 'react';
import { BoltIcon, EnvelopeIcon, LockClosedIcon, UserIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { auth, db } from '../lib/firebase';
import { UserRole } from '../types';

interface LoginProps {
  isDarkMode: boolean;
}

const Login: React.FC<LoginProps> = ({ isDarkMode }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const mapAuthError = (code: string): string => {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        if (isRegistering) {
          return "This email is already registered. If you haven't set a password yet, please use the 'Forgot Password' link to reset it.";
        }
        return "Invalid email or password. If you were recently invited, please use the 'Setup Account' link below.";
      case 'auth/email-already-in-use':
        return "This email is already associated with an account. Try logging in or resetting your password if you don't know it.";
      case 'auth/weak-password':
        return "Your password is too short. Please use at least 6 characters.";
      case 'auth/network-request-failed':
        return "Network error. Please check your internet connection.";
      case 'auth/too-many-requests':
        return "Too many failed attempts. Access has been temporarily disabled.";
      default:
        return "An unexpected error occurred. Please try again later.";
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Trim email to avoid accidental spaces causing invalid-credential
      const cleanEmail = email.trim();
      const emailKey = cleanEmail.toLowerCase();
      
      if (isForgotPassword) {
        await sendPasswordResetEmail(auth, cleanEmail);
        setToast({ message: "Password reset email sent! Check your inbox.", type: 'success' });
        setIsForgotPassword(false);
        return;
      }

      if (isRegistering) {
        const masterAdminEmail = "ahmed.evolt@gmail.com";
        const isMasterAdmin = emailKey === masterAdminEmail.toLowerCase();
        
        const userDocRef = doc(db, "users", emailKey);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists() && !isMasterAdmin) {
          throw new Error("Access Denied: Your email has not been whitelisted by an administrator.");
        }

        const userData = userDoc.data();
        
        // If they are already active, redirect them to login
        if (userData?.status === 'Active' && !isMasterAdmin) {
          setIsRegistering(false);
          throw new Error("Account already setup. Please log in with your credentials.");
        }

        const inviteName = name || userData?.name || (isMasterAdmin ? "Master Admin" : "");

        let userCredential;
        try {
          userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-in-use') {
            // If account already exists in Auth but is still 'Pending' in Firestore,
            // we try to sign in. If password matches, they can proceed and we activate the doc.
            try {
              userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
            } catch (signInErr: any) {
              // Sign in failed, meaning they have an account but wrong password.
              // We should not let them "setup" with a new password this way.
              // Direct them to Forgot Password.
              throw new Error("This email is already registered. If you haven't set a password yet, please use 'Forgot Password' to create one.");
            }
          } else {
            throw authErr;
          }
        }
        
        await updateProfile(userCredential.user, {
          displayName: inviteName
        });

        if (isMasterAdmin && !userDoc.exists()) {
          await setDoc(userDocRef, {
            email: emailKey,
            role: UserRole.ADMIN,
            status: 'Active',
            name: inviteName,
            uid: userCredential.user.uid,
            invitedAt: new Date().toISOString()
          });
        } else {
          await updateDoc(userDocRef, { 
            status: 'Active',
            uid: userCredential.user.uid,
            name: inviteName // Save the name provided by user
          });
        }
        setToast({ message: "Account setup successfully! Welcome aboard.", type: 'success' });
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      const friendlyMessage = err.code ? mapAuthError(err.code) : err.message;
      setToast({ message: friendlyMessage, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB] dark:bg-zinc-950 p-4 transition-colors">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-[60] animate-in slide-in-from-right duration-300">
          <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl border shadow-2xl ${
            toast.type === 'error' 
              ? 'bg-zinc-900 border-red-500/30 text-zinc-100' 
              : 'bg-zinc-900 border-green-500/30 text-zinc-100'
          }`}>
            <span className="text-sm font-bold">{toast.message}</span>
            <button onClick={() => setToast(null)} className="p-1 hover:bg-zinc-800 rounded-lg transition-colors">
              <XMarkIcon className="w-4 h-4 text-zinc-500" />
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-xl shadow-indigo-100/50 dark:shadow-none border border-gray-100 dark:border-zinc-800 p-8 sm:p-12">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-16 h-16 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-lg shadow-indigo-200 mb-6 transition-transform hover:scale-105">
              <BoltIcon className="w-10 h-10" />
            </div>
            <h1 className="text-3xl font-bold font-heading text-zinc-900 dark:text-white mb-2">
              {isForgotPassword ? 'Reset Password' : isRegistering ? 'Setup Account' : 'BD Ops Login'}
            </h1>
            <p className="text-gray-500 dark:text-zinc-400 font-semibold text-sm px-4">
              {isForgotPassword
                ? 'Enter your email to receive a reset link.'
                : isRegistering 
                ? 'Only invited users can setup their account.' 
                : 'Secure access to high-performance energy.'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-5">
            {!isForgotPassword && isRegistering && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 ml-1 uppercase tracking-wider">Full Name</label>
                <div className="relative group">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-zinc-950 border border-transparent dark:border-zinc-800 rounded-2xl text-sm focus:bg-white dark:focus:bg-zinc-900 focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 outline-none transition-all dark:text-zinc-100"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 ml-1 uppercase tracking-wider">Email</label>
              <div className="relative group">
                <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-zinc-950 border border-transparent dark:border-zinc-800 rounded-2xl text-sm focus:bg-white dark:focus:bg-zinc-900 focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 outline-none transition-all dark:text-zinc-100"
                  required
                />
              </div>
            </div>

            {!isForgotPassword && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 ml-1 uppercase tracking-wider">Password</label>
                <div className="relative group">
                  <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-zinc-950 border border-transparent dark:border-zinc-800 rounded-2xl text-sm focus:bg-white dark:focus:bg-zinc-900 focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 outline-none transition-all dark:text-zinc-100"
                    required
                  />
                </div>
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold font-button shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center justify-center disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                isForgotPassword ? 'Send Reset Link' : isRegistering ? 'Setup My Account' : 'Login'
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-50 dark:border-zinc-800 flex flex-col gap-3 text-center">
            {!isRegistering && !isForgotPassword && (
              <button 
                onClick={() => setIsForgotPassword(true)}
                className="text-xs font-bold text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
              >
                Forgot Password?
              </button>
            )}
            
            <button 
              onClick={() => {
                if (isForgotPassword) {
                  setIsForgotPassword(false);
                } else {
                  setIsRegistering(!isRegistering);
                }
              }}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline transition-all"
            >
              {isForgotPassword 
                ? 'Back to Login'
                : isRegistering 
                ? 'Back to Login' 
                : 'Invited by admin? Setup Account'}
            </button>
          </div>
        </div>
        
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-400 dark:text-zinc-600 font-semibold">
            v2.5.0 Build 202502 • Secure Operations
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
