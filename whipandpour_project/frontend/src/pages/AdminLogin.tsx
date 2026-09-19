import { useState } from 'react';
import { useLocation } from 'wouter';
import { Flame, Eye, EyeOff } from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';
import { toast } from 'sonner';

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const { adminLogin } = useAdmin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Credentials are checked by the backend against a hashed password; this
    // component never sees whether the email or the password was the problem.
    const result = await adminLogin(email, password);
    if (result.ok) {
      toast.success('Welcome back, Admin!');
      navigate('/admin');
    } else {
      setError(result.message ?? 'Invalid email or password. Please try again.');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF7F2] via-[#F5EFE8] to-[#E8DDD0] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#2C2C2C] rounded-2xl mb-4 shadow-lg">
            <Flame size={32} className="text-[#C9A84C]" />
          </div>
          <h1 className="text-3xl font-bold text-[#2C2C2C]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Whip & Pour
          </h1>
          <p className="text-[#7A7066] mt-1 text-sm font-medium tracking-widest uppercase">Admin Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-[#E8DDD0] p-8">
          <h2 className="text-xl font-bold text-[#2C2C2C] mb-6 text-center">Sign in to Admin</h2>

          {error && (
            <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2">
              <span className="mt-0.5">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-[#2C2C2C] mb-1.5">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-[#E8DDD0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C9A84C] bg-[#FAF7F2] text-[#2C2C2C]"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#2C2C2C] mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 pr-12 border border-[#E8DDD0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C9A84C] bg-[#FAF7F2] text-[#2C2C2C]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#7A7066] hover:text-[#2C2C2C]"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-[#C9A84C] text-[#2C2C2C] rounded-xl font-bold hover:bg-[#D4A5A5] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-[#2C2C2C] border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/*
            The working admin password used to be printed here, on a page
            reachable by anyone. Credentials now come from ADMIN_EMAIL /
            ADMIN_PASSWORD in backend/.env and are never rendered.
          */}
          <p className="mt-6 text-xs text-center text-[#7A7066]">
            Lost access? Reset the admin password via <code>ADMIN_PASSWORD</code> in
            the backend environment.
          </p>
        </div>

        <p className="text-center text-xs text-[#7A7066] mt-6">
          © 2026 Whip & Pour. All rights reserved.
        </p>
      </div>
    </div>
  );
}
