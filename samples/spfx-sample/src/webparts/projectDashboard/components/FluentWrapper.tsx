import * as React from "react";

/**
 * The Fluent v8 skin is provider-free — v8 controls render against the ambient Fabric theme
 * SharePoint already injects, so no theme provider is mounted. (The `isDark` prop is retained
 * for API stability; apps wanting exact dark-section fidelity may wrap children in a v8
 * `ThemeProvider` here.)
 */
export const FluentWrapper: React.FC<{
  isDark?: boolean;
  children: React.ReactNode;
}> = ({ children }) => {
  return <>{children}</>;
};
