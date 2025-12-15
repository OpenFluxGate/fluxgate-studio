'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { signIn } from 'next-auth/react';

import { ArrowRight, Shield } from 'lucide-react';

import { ThemeProvider, useTheme } from '@/modules/admin';
import { ThemeSwitcher } from '@/modules/admin/components';

function LoginContent() {
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);

  const handleKeycloakLogin = async () => {
    setIsLoading(true);
    await signIn('keycloak', { callbackUrl: '/' });
  };

  return (
    <div
      className={`min-h-screen ${theme.colors.bg} relative flex items-center justify-center overflow-hidden p-4 transition-colors duration-300`}
    >
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className={`absolute top-1/4 left-1/4 h-96 w-96 ${theme.colors.bgGlow} rounded-full blur-3xl`}
        />
        <div
          className={`absolute right-1/4 bottom-1/4 h-96 w-96 ${theme.colors.bgGlow} rounded-full blur-3xl`}
        />
        <div
          className={`absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 ${theme.colors.bgGlow} rounded-full opacity-50 blur-3xl`}
        />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="fixed inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Theme Switcher - Top Right */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeSwitcher />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo and Header */}
        <div className="mb-8 text-center">
          <div className="mb-6 inline-flex items-center justify-center">
            <div className="relative">
              <div className={`absolute inset-0 ${theme.colors.bgGlow} rounded-2xl blur-xl`} />
              <Image
                src="/logo.svg"
                alt="FluxGate"
                width={80}
                height={80}
                className={`relative rounded-2xl ${theme.colors.shadowAccent}`}
              />
            </div>
          </div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight">
            <span
              className={`bg-gradient-to-r bg-clip-text text-transparent ${theme.colors.gradientPrimary}`}
            >
              FluxGate
            </span>
            <span className={`${theme.colors.textTertiary} ml-2 font-normal`}>Studio</span>
          </h1>
          <p className={`${theme.colors.textMuted} text-sm`}>Sign in to manage your rate limits</p>
        </div>

        {/* Login Card */}
        <div className="relative">
          <div
            className={`absolute inset-0 bg-gradient-to-r ${theme.colors.gradientGlow} rounded-2xl blur-xl`}
          />
          <div
            className={`relative ${theme.colors.bgSecondary} backdrop-blur-xl ${theme.colors.border} rounded-2xl border p-8 ${theme.colors.shadow}`}
          >
            {/* Keycloak Login Button */}
            <button
              onClick={handleKeycloakLogin}
              disabled={isLoading}
              className={`w-full bg-gradient-to-r py-4 ${theme.colors.gradientPrimary} rounded-xl font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50 ${theme.colors.shadowAccent} group flex items-center justify-center gap-3`}
            >
              {isLoading ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span>Redirecting to Keycloak...</span>
                </>
              ) : (
                <>
                  <Shield size={20} />
                  <span>Sign in with Keycloak</span>
                  <ArrowRight
                    size={18}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className={`w-full border-t ${theme.colors.border}`} />
              </div>
              <div className="relative flex justify-center">
                <span
                  className={`px-4 text-xs ${theme.colors.textMuted} ${theme.colors.bgSecondary}`}
                >
                  Secure Authentication
                </span>
              </div>
            </div>

            {/* Info Section */}
            <div
              className={`p-4 ${theme.colors.bgTertiary} ${theme.colors.borderSubtle} rounded-xl border`}
            >
              <p className={`text-xs ${theme.colors.textMuted} text-center`}>
                Authentication is handled by Keycloak.
                <br />
                You will be redirected to the identity provider.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className={`text-center ${theme.colors.textMuted} mt-8 text-xs`}>
          © 2025 FluxGate. Rate Limit Management Platform.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <ThemeProvider>
      <LoginContent />
    </ThemeProvider>
  );
}
