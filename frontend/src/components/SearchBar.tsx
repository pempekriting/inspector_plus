import { useState, useCallback, memo, useEffect, useRef } from "react";
import { useHierarchyStore, SearchFilter } from "../stores/hierarchyStore";
import { useThemeStore } from "../stores/themeStore";
import { searchHierarchy } from "../hooks/useDevice";
import { useDeviceStore } from "../stores/deviceStore";

const FILTER_OPTIONS: { value: SearchFilter; label: string }[] = [
  { value: "xpath", label: "XPath" },
  { value: "resource-id", label: "Res-ID" },
  { value: "text", label: "Text" },
  { value: "content-desc", label: "Content" },
  { value: "class", label: "Class" },
];

export const SearchBar = memo(function SearchBar() {
  const { theme } = useThemeStore();
  const isDark = theme === "dark";
  const {
    searchQuery,
    searchFilter,
    setSearchQuery,
    setSearchFilter,
    isSearchActive,
    searchResultsCount,
    searchResults,
    currentSearchIndex,
    setCurrentSearchIndex,
    setSearchResults,
    clearSearch,
    lockSelection,
    setSelectedNode,
  } = useHierarchyStore();
  const { selectedDevice } = useDeviceStore();

  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [isRegex, setIsRegex] = useState(false);
  const [charError, setCharError] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localQueryRef = useRef(searchQuery);
  const searchBarRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<number | null>(null);
  // Refs to avoid stale closures in debounced callbacks
  const searchFilterRef = useRef(searchFilter);
  const selectedDeviceRef = useRef(selectedDevice);
  const setSearchResultsRef = useRef(setSearchResults);

  // Keep refs in sync with store values
  useEffect(() => { searchFilterRef.current = searchFilter; }, [searchFilter]);
  useEffect(() => { selectedDeviceRef.current = selectedDevice; }, [selectedDevice]);
  useEffect(() => { setSearchResultsRef.current = setSearchResults; }, [setSearchResults]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Restore cursor position after re-render
  useEffect(() => {
    if (cursorRef.current !== null && searchBarRef.current) {
      searchBarRef.current.setSelectionRange(cursorRef.current, cursorRef.current);
    }
  }, [localQuery]);

  // D4: Navigate search results with up/down
  const navigateResults = useCallback((direction: 1 | -1) => {
    if (!isSearchActive || searchResults.length === 0) return;
    const nextIndex = currentSearchIndex === -1
      ? 0
      : (currentSearchIndex + direction + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
  }, [isSearchActive, currentSearchIndex, searchResults.length, setCurrentSearchIndex]);

  // Clear search
  const handleClear = useCallback(() => {
    setLocalQuery("");
    localQueryRef.current = "";
    if (debounceRef.current) clearTimeout(debounceRef.current);
    clearSearch();
    lockSelection(null);
    setSelectedNode(null);
  }, [clearSearch, lockSelection, setSelectedNode]);

  // Run backend search and update store
  const runSearch = useCallback(async (query: string, filter: SearchFilter) => {
    if (!query.trim()) {
      setSearchResultsRef.current([], 0);
      return;
    }
    setIsSearching(true);
    try {
      const data = await searchHierarchy(query, filter, selectedDeviceRef.current ?? undefined) as {
        matches: Array<{ id: string; text?: string; contentDesc?: string; resourceId?: string; resourceIdFull?: string; className?: string; [key: string]: unknown }>;
        count: number;
      };
      console.debug("[SearchBar] raw BE response:", JSON.stringify(data));
      const results = (data.matches || []).map((m) => ({
        nodeId: m.id,
        matchField: m.text ? "text" : m.contentDesc ? "content-desc" : m.resourceId ? "resource-id" : "class",
        matchedText: m.text || m.contentDesc || m.resourceId || m.className || "",
        node: m as Parameters<typeof setSearchResults>[0][number]["node"],
      }));
      setSearchResultsRef.current(results, data.count || 0);
    } catch {
      setSearchResultsRef.current([], 0);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const target = e.target;
      const val = target.value;
      cursorRef.current = target.selectionStart;
      setLocalQuery(val);
      localQueryRef.current = val;

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (val.length > 500) {
        setCharError(true);
        return;
      }
      setCharError(false);

      if (!val.trim()) {
        runSearch("", "xpath");
        return;
      }

      debounceRef.current = setTimeout(() => {
        runSearch(val, searchFilterRef.current);
      }, 300);
    },
    [runSearch]
  );

  const handleFilterChange = useCallback(
    (filter: SearchFilter) => {
      setSearchFilter(filter);
      const currentQuery = localQueryRef.current;
      if (currentQuery.trim()) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          runSearch(currentQuery, filter);
        }, 150);
      }
    },
    [setSearchFilter, runSearch]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Only navigate results when there are actual results to navigate
    // This allows arrow keys to work for cursor movement when search is empty
    if (e.key === "ArrowDown" && searchResults.length > 0) {
      e.preventDefault();
      navigateResults(1);
    } else if (e.key === "ArrowUp" && searchResults.length > 0) {
      e.preventDefault();
      navigateResults(-1);
    } else if (e.key === "Escape") {
      handleClear();
    }
  }, [navigateResults, handleClear, searchResults.length]);

  return (
    <div
      className="px-3 py-2 flex-shrink-0"
      style={{
        background: "var(--bg-tertiary)",
        borderBottom: "var(--nb-border)",
      }}
    >
      {/* Search Input Row */}
      <div className="flex items-center gap-2">
        {/* Search Input */}
        <div className="flex-1 relative">
          <input
            ref={searchBarRef}
            type="text"
            value={localQuery}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            placeholder="Search elements... (regex supported)"
            maxLength={500}
            className="w-full h-8 px-3 pr-16 text-[11px] font-medium rounded outline-none transition-all"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: charError
                ? "2px solid #ef4444"
                : "2px solid var(--border-default)",
              boxShadow: isDark ? "var(--nb-shadow-dark)" : "var(--nb-shadow-light)",
            }}
          />
          {/* Char limit error tooltip */}
          {charError && (
            <div className="absolute right-16 top-1/2 -translate-y-1/2 pointer-events-none">
              <span className="text-[9px] font-bold text-red-500">max 500</span>
            </div>
          )}
          {/* Clear Button */}
          {localQuery && (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded transition-transform active:scale-90"
              style={{
                background: "var(--border-default)",
                color: "var(--text-secondary)",
              }}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Regex Toggle */}
        <button
          onClick={() => setIsRegex(prev => !prev)}
          className="h-8 px-2.5 flex items-center gap-1 rounded text-[10px] font-bold font-mono transition-all active:scale-95"
          style={{
            background: isRegex
              ? (isDark ? "var(--bg-primary)" : "#1a1a1a")
              : "var(--bg-elevated)",
            color: isRegex
              ? (isDark ? "var(--accent-amber)" : "var(--accent-orange)")
              : "var(--text-secondary)",
            border: isRegex
              ? "2px solid var(--accent-amber)"
              : "2px solid var(--border-default)",
            boxShadow: isRegex
              ? (isDark ? "var(--nb-shadow-dark)" : "var(--nb-shadow-light)")
              : "none",
          }}
          title="Toggle regex mode"
        >
          .*
        </button>

        {/* Searching spinner */}
        {isSearching && (
          <div
            className="h-8 w-8 flex items-center justify-center rounded"
            style={{ background: "var(--bg-elevated)", border: "2px solid var(--border-default)" }}
          >
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
              style={{ color: "var(--accent-cyan)" }}>
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.2" />
              <path d="M21 12a9 9 0 01-9 9" strokeLinecap="round" />
            </svg>
          </div>
        )}

        {/* Result count badge */}
        {isSearchActive && searchResultsCount > 0 && !isSearching && (
          <div
            className="h-8 px-2 flex items-center rounded"
            style={{
              background: isDark ? "rgba(253,224,71,0.15)" : "rgba(180,83,9,0.15)",
              color: "var(--accent-amber)",
              border: "2px solid var(--accent-amber)",
            }}
          >
            <span className="text-[10px] font-bold font-mono">
              {currentSearchIndex >= 0 ? currentSearchIndex + 1 : "?"}/{searchResultsCount}
            </span>
          </div>
        )}
      </div>

      {/* Filter Chips Row */}
      <div className="flex items-center gap-1.5 mt-2 overflow-x-auto">
        {FILTER_OPTIONS.map((option) => {
          const isActive = searchFilter === option.value;
          return (
            <button
              key={option.value}
              onClick={() => handleFilterChange(option.value)}
              className="px-2.5 py-1 flex-shrink-0 text-[10px] font-bold rounded transition-all active:scale-95"
              style={{
                background: isActive
                  ? "var(--bg-primary)"
                  : "var(--bg-elevated)",
                color: isActive
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
                border: isActive
                  ? "2px solid var(--border-default)"
                  : "2px solid var(--border-default)",
                boxShadow: isActive
                  ? (isDark ? "var(--nb-shadow-dark)" : "var(--nb-shadow-light)")
                  : "none",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
});
