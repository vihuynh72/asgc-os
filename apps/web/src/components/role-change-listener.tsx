"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import {
  isMissingAuthSessionError,
  isProbablyNetworkError,
  swallowNetworkError,
} from "@/lib/network-errors.mjs";

/**
 * RoleChangeListener - Polls profile_private.roles_updated_at and role_assignments updates to detect role changes.
 * Shows modal prompting re-authentication when roles are granted or revoked.
 */
export function RoleChangeListener() {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const baselineRef = useRef<string | null>(null);
  const baselineUserIdRef = useRef<string | null>(null);
  const hasShownModalRef = useRef(false);
  const lastNetworkErrorAtRef = useRef<number>(0);

  const shouldLogNetworkError = () => {
    const now = Date.now();
    // Avoid spamming the console on flaky connections.
    if (now - lastNetworkErrorAtRef.current < 30_000) return false;
    lastNetworkErrorAtRef.current = now;
    return true;
  };

  const resetBaseline = useCallback(() => {
    baselineRef.current = null;
    baselineUserIdRef.current = null;
    hasShownModalRef.current = false;
  }, []);

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Sign out failed:", e);
    }
    router.replace("/login?reason=role_changed");
    router.refresh();
  }, [router]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let interval: NodeJS.Timeout | null = null;
    let cancelled = false;

    async function fetchRoleChangeToken(userId: string) {
      const results = await swallowNetworkError(() =>
        Promise.all([
          supabase
            .from("profile_private")
            .select("roles_updated_at")
            .eq("id", userId)
            .maybeSingle(),
          supabase
            .from("role_assignments")
            .select("updated_at")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])
      );

      if (!results) {
        if (shouldLogNetworkError()) {
          console.warn("[RoleChangeListener] network error (will retry).");
        }
        return null;
      }

      const [profileResult, assignmentResult] = results;

      const profileErrorMessage = profileResult.error?.message ?? null;
      const assignmentErrorMessage = assignmentResult.error?.message ?? null;

      const profileNetworkError = isProbablyNetworkError(profileErrorMessage);
      const assignmentNetworkError = isProbablyNetworkError(assignmentErrorMessage);

      if (profileResult.error && !profileNetworkError) {
        console.error("[RoleChangeListener] profile_private error:", profileErrorMessage);
      } else if (profileNetworkError && shouldLogNetworkError()) {
        console.warn("[RoleChangeListener] profile_private network error (will retry).");
      }

      if (assignmentResult.error && !assignmentNetworkError) {
        console.error("[RoleChangeListener] role_assignments error:", assignmentErrorMessage);
      } else if (assignmentNetworkError && shouldLogNetworkError()) {
        console.warn("[RoleChangeListener] role_assignments network error (will retry).");
      }

      if (profileResult.error && assignmentResult.error) {
        return null;
      }

      const rolesUpdatedAt = profileResult.data?.roles_updated_at ?? null;
      const assignmentUpdatedAt = assignmentResult.data?.updated_at ?? null;

      return {
        rolesUpdatedAt,
        assignmentUpdatedAt,
        token: `${rolesUpdatedAt ?? ""}|${assignmentUpdatedAt ?? ""}`,
      };
    }

    async function checkRolesUpdated() {
      if (cancelled || hasShownModalRef.current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;

      try {
        const authResult = await swallowNetworkError(() => supabase.auth.getSession());
        if (!authResult) {
          if (shouldLogNetworkError()) {
            console.warn("[RoleChangeListener] auth network error (will retry).");
          }
          return;
        }

        const {
          data: { session },
          error,
        } = authResult;

        if (error) {
          if (isProbablyNetworkError(error.message) && shouldLogNetworkError()) {
            console.warn("[RoleChangeListener] auth network error (will retry).");
          } else if (isMissingAuthSessionError(error.message)) {
            resetBaseline();
          } else if (!isProbablyNetworkError(error.message)) {
            console.error("[RoleChangeListener] auth error:", error.message);
          }
          return;
        }

        const user = session?.user ?? null;
        if (!user) {
          resetBaseline();
          return;
        }

        const userId = user.id;

        if (baselineUserIdRef.current !== userId) {
          baselineUserIdRef.current = userId;
          baselineRef.current = null;
          hasShownModalRef.current = false;
        }

        const tokenResult = await fetchRoleChangeToken(userId);
        if (!tokenResult) return;
        if (cancelled || hasShownModalRef.current) return;

        if (baselineRef.current === null) {
          // First check - set baseline
          baselineRef.current = tokenResult.token;
        } else if (tokenResult.token !== baselineRef.current) {
          // Token changed - role was granted or revoked
          hasShownModalRef.current = true;
          if (interval) clearInterval(interval);
          setShowModal(true);
        }
      } catch (error) {
        if (isProbablyNetworkError(error)) {
          if (shouldLogNetworkError()) {
            console.warn("[RoleChangeListener] network error (will retry).");
          }
          return;
        }
        console.error("[RoleChangeListener] unexpected error:", error);
        return;
      }
    }

    checkRolesUpdated();
    interval = setInterval(checkRolesUpdated, 5000); // Poll every 5 seconds

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user?.id) {
        resetBaseline();
        return;
      }
      if (baselineUserIdRef.current !== session.user.id) {
        baselineUserIdRef.current = session.user.id;
        baselineRef.current = null;
        hasShownModalRef.current = false;
      }
    });

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      subscription.unsubscribe();
    };
  }, [resetBaseline]);

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="rounded-lg border bg-background shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-3 border-b px-6 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <svg
                className="h-5 w-5 text-amber-600"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Access Updated
              </h2>
              <p className="text-sm text-foreground/70">
                Your permissions have changed
              </p>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-4">
            <p className="text-sm text-foreground/80 leading-relaxed">
              Your role assignments have been updated by an administrator.
              Please sign in again to apply the changes.
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t bg-muted/30 px-6 py-4">
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSigningOut ? (
                <>
                  <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing out...
                </>
              ) : (
                "Sign in again"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
