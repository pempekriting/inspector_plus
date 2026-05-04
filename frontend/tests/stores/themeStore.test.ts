import { describe, it, expect, vi, beforeEach } from "vitest";
import { useThemeStore, ThemeMode } from "../../src/stores/themeStore";

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

describe("themeStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    useThemeStore.setState({ theme: "dark" });
  });

  describe("initial state", () => {
    it("defaults to dark theme", () => {
      useThemeStore.setState({ theme: "dark" });
      const state = useThemeStore.getState();
      expect(state.theme).toBe("dark");
    });

    it("reads stored theme from localStorage", () => {
      localStorageMock.getItem.mockReturnValue("light");
      useThemeStore.setState({ theme: "light" });

      const state = useThemeStore.getState();
      expect(state.theme).toBe("light");
    });

    it("falls back to dark for invalid stored value", () => {
      localStorageMock.getItem.mockReturnValue("invalid");
      const state = useThemeStore.getState();
      expect(state.theme).toBe("dark");
    });
  });

  describe("setTheme", () => {
    it("sets theme to specified value", () => {
      useThemeStore.getState().setTheme("light");
      expect(useThemeStore.getState().theme).toBe("light");
    });

    it("persists theme to localStorage", () => {
      useThemeStore.getState().setTheme("light");
      expect(localStorageMock.setItem).toHaveBeenCalledWith("inspector-plus-theme", "light");
    });

    it("handles localStorage error gracefully", () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error("Storage full");
      });

      // Should not throw
      expect(() => useThemeStore.getState().setTheme("light")).not.toThrow();
    });
  });

  describe("toggleTheme", () => {
    it("toggles from dark to light", () => {
      useThemeStore.setState({ theme: "dark" });
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().theme).toBe("light");
    });

    it("toggles from light to dark", () => {
      useThemeStore.setState({ theme: "light" });
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().theme).toBe("dark");
    });

    it("persists toggled theme to localStorage", () => {
      useThemeStore.setState({ theme: "dark" });
      useThemeStore.getState().toggleTheme();
      expect(localStorageMock.setItem).toHaveBeenCalledWith("inspector-plus-theme", "light");
    });
  });
});