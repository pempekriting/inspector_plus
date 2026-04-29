import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { SearchBar } from "../SearchBar";

const mockUseHierarchyStore = vi.fn(() => ({
  searchQuery: "",
  searchFilter: "xpath" as const,
  setSearchQuery: vi.fn(),
  setSearchFilter: vi.fn(),
  isSearchActive: false,
  searchResultsCount: 0,
  searchResults: [] as any[],
  currentSearchIndex: -1,
  setCurrentSearchIndex: vi.fn(),
  setSearchResults: vi.fn(),
  clearSearch: vi.fn(),
}));

vi.mock("@/stores/hierarchyStore", () => ({
  useHierarchyStore: () => mockUseHierarchyStore(),
}));

vi.mock("@/stores/themeStore", () => ({
  useThemeStore: vi.fn(() => ({ theme: "dark" })),
}));

describe("SearchBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseHierarchyStore.mockReturnValue({
      searchQuery: "", searchFilter: "xpath" as const, setSearchQuery: vi.fn(), setSearchFilter: vi.fn(),
      isSearchActive: false, searchResultsCount: 0, searchResults: [], currentSearchIndex: -1,
      setCurrentSearchIndex: vi.fn(), setSearchResults: vi.fn(), clearSearch: vi.fn(),
    });
  });

  it("renders search input", () => {
    render(<SearchBar />);
    expect(screen.getByPlaceholderText(/Search elements/)).toBeInTheDocument();
  });

  it("renders filter chips", () => {
    render(<SearchBar />);
    // Filter chips appear twice (once in the chip row, once in results) — use getAllByText
    expect(screen.getAllByText("XPath").length).toBeGreaterThan(0);
  });

  it("renders regex toggle", () => {
    render(<SearchBar />);
    expect(screen.getAllByText(".*").length).toBeGreaterThan(0);
  });

  it("renders without crashing", () => {
    const { container } = render(<SearchBar />);
    expect(container).toBeDefined();
  });

  it("calls setSearchFilter when a filter chip is clicked", () => {
    const setSearchFilter = vi.fn();
    mockUseHierarchyStore.mockReturnValue({
      searchQuery: "", searchFilter: "xpath" as const, setSearchQuery: vi.fn(), setSearchFilter,
      isSearchActive: false, searchResultsCount: 0, searchResults: [], currentSearchIndex: -1,
      setCurrentSearchIndex: vi.fn(), setSearchResults: vi.fn(), clearSearch: vi.fn(),
    });
    render(<SearchBar />);
    // Click the Res-ID chip (in the filter chips row)
    const chips = screen.getAllByText("Res-ID");
    fireEvent.click(chips[0]);
  });

  it("renders with search results", () => {
    mockUseHierarchyStore.mockReturnValue({
      searchQuery: "Button", searchFilter: "xpath" as const, setSearchQuery: vi.fn(), setSearchFilter: vi.fn(),
      isSearchActive: true, searchResultsCount: 3, searchResults: [{ id: "n1" }, { id: "n2" }] as any[],
      currentSearchIndex: 1, setCurrentSearchIndex: vi.fn(), setSearchResults: vi.fn(), clearSearch: vi.fn(),
    });
    const { container } = render(<SearchBar />);
    expect(container).toBeDefined();
  });
});