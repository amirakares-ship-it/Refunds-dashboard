import React, { useState } from 'react';
import { Lock, X, Loader2, AlertCircle } from 'lucide-react';
import { verifyAdminPassword, setStoredAdminPassword } from '../utils/adminAuth';

interface AdminPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdminPasswordModal: React.FC<AdminPasswordModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [password, setPassword] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setIsChecking(true);
    setError(null);

    const result = await verifyAdminPassword(password);
    setIsChecking(false);

    if (result.success) {
      setStoredAdminPassword(password);
      setPassword('');
      onSuccess();
    } else {
      setError(result.error || 'كلمة السر غير صحيحة');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center gap-2 mb-5">
          <div className="w-11 h-11 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="text-white font-bold text-base">وضع التعديل محمي بكلمة سر</h2>
          <p className="text-slate-400 text-xs">
            ادخلي كلمة السر عشان تقدري ترفعي أو تعدّلي البيانات
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="كلمة السر"
            className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center tracking-widest"
          />

          {error && (
            <div className="flex items-center gap-1.5 text-rose-400 text-xs justify-center">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isChecking || !password}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
          >
            {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            دخول
          </button>
        </form>
      </div>
    </div>
  );
};
