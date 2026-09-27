<template>
  <div class="custom-search" v-click-outside="closeSuggestions">
    <div class="search-input-wrapper">
      <input
        ref="searchInput"
        type="text"
        v-model="query"
        @keyup.enter="handleEnter"
        @keydown.down.prevent="navigateSuggestions(1)"
        @keydown.up.prevent="navigateSuggestions(-1)"
        @keydown.esc="closeSuggestions"
        @focus="handleFocus"
        @input="handleInput"
        @keyup.stop
        @keydown.stop
        :placeholder="placeholder"
        autocomplete="off"
        spellcheck="false"
      />
      <button v-if="query" class="clear-btn" @click="clearQuery" title="Clear">✕</button>
      <button class="search-btn" @click="executeSearch(query)" title="Search">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </button>
    </div>

    <!-- 快捷引擎按钮 -->
    <div class="buttons" v-if="engines && engines.length > 1">
      <button
        v-for="(engine, key) in engines"
        :key="key"
        @click="searchWithEngine(engine, openingMethod)"
      >
        {{ engine.title }}
      </button>
    </div>

    <!-- 搜索联想与历史记录下拉面板（传送挂载到 body，彻底防止被任何父级 overflow 截断） -->
    <Teleport to="body">
      <div
        v-if="showDropdown && (historyList.length > 0 || suggestions.length > 0)"
        class="search-suggestions-dropdown-floating"
        :style="dropdownStyle"
        @mousedown.stop
      >
        <!-- 历史记录 -->
        <div v-if="historyList.length > 0 && !query.trim()" class="dropdown-section">
          <div class="dropdown-header">
            <span>Recent Searches</span>
            <button class="clear-history-btn" @click.stop="clearAllHistory">Clear All</button>
          </div>
          <div
            v-for="(item, idx) in historyList"
            :key="'hist-' + idx"
            :class="['suggestion-item', 'history-item', { active: selectedIndex === idx }]"
            @mousedown.prevent="selectSuggestion(item)"
          >
            <span class="icon">🕒</span>
            <span class="text">{{ item }}</span>
            <button class="delete-item-btn" @mousedown.stop.prevent="deleteHistoryItem(item)" title="Delete">×</button>
          </div>
        </div>

        <!-- 实时联想补全 -->
        <div v-if="suggestions.length > 0" class="dropdown-section">
          <div
            v-for="(item, idx) in suggestions"
            :key="'sug-' + idx"
            :class="['suggestion-item', { active: selectedIndex === idx }]"
            @mousedown.prevent="selectSuggestion(item)"
          >
            <span class="icon">🔍</span>
            <span class="text" v-html="highlightMatch(item, query)"></span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script>
import router from '@/router';
import WidgetMixin from '@/mixins/WidgetMixin';
import ErrorHandler from '@/utils/logging/ErrorHandler';
import { isUrlLike } from '@/utils/Search';

const HISTORY_STORAGE_KEY = 'dashy_search_history';

export default {
  mixins: [WidgetMixin],
  data() {
    return {
      query: '',
      suggestions: [],
      historyList: [],
      showDropdown: false,
      selectedIndex: -1,
      debounceTimer: null,
      currentJsonpScript: null,
      dropdownCoords: { top: 0, left: 0, width: 0 },
    };
  },
  computed: {
    placeholder() {
      return this.options.placeholder || 'Search Google or type a URL...';
    },
    engines() {
      return this.options.engines || [];
    },
    defaultEngine() {
      if (this.engines && this.engines.length > 0) {
        return this.engines[0];
      }
      return { title: 'Google', url: 'https://www.google.com/search?q=' };
    },
    openingMethod() {
      return this.options.openingMethod || 'newtab';
    },
    dropdownStyle() {
      return {
        top: `${this.dropdownCoords.top}px`,
        left: `${this.dropdownCoords.left}px`,
        width: `${this.dropdownCoords.width}px`,
      };
    },
  },
  mounted() {
    this.loadHistory();
    window.addEventListener('resize', this.updateDropdownCoords);
    window.addEventListener('scroll', this.updateDropdownCoords, true);
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.updateDropdownCoords);
    window.removeEventListener('scroll', this.updateDropdownCoords, true);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.currentJsonpScript && document.body.contains(this.currentJsonpScript)) {
      document.body.removeChild(this.currentJsonpScript);
    }
  },
  methods: {
    updateDropdownCoords() {
      if (!this.showDropdown) return;
      const el = this.$refs.searchInput;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      this.dropdownCoords = {
        top: rect.bottom + window.scrollY + 6,
        left: rect.left + window.scrollX,
        width: rect.width,
      };
    },
    loadHistory() {
      try {
        const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
        this.historyList = stored ? JSON.parse(stored) : [];
      } catch (e) {
        this.historyList = [];
      }
    },
    saveHistory(term) {
      if (!term || typeof term !== 'string') return;
      const cleanTerm = term.trim();
      if (!cleanTerm || isUrlLike(cleanTerm)) return;
      try {
        let list = this.historyList.filter((item) => item.toLowerCase() !== cleanTerm.toLowerCase());
        list.unshift(cleanTerm);
        if (list.length > 10) list = list.slice(0, 10);
        this.historyList = list;
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list));
      } catch (e) {
        ErrorHandler('Error saving search history to localStorage', e);
      }
    },
    deleteHistoryItem(item) {
      this.historyList = this.historyList.filter((h) => h !== item);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(this.historyList));
      } catch (e) {}
    },
    clearAllHistory() {
      this.historyList = [];
      try {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
      } catch (e) {}
    },
    handleFocus() {
      this.loadHistory();
      this.showDropdown = true;
      this.$nextTick(this.updateDropdownCoords);
      if (this.query.trim()) {
        this.fetchSuggestions(this.query.trim());
      }
    },
    closeSuggestions() {
      this.showDropdown = false;
      this.selectedIndex = -1;
    },
    clearQuery() {
      this.query = '';
      this.suggestions = [];
      this.selectedIndex = -1;
      this.$refs.searchInput?.focus();
    },
    handleInput() {
      const q = this.query.trim();
      this.selectedIndex = -1;
      this.updateDropdownCoords();
      if (!q) {
        this.suggestions = [];
        return;
      }
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.fetchSuggestions(q);
      }, 150);
    },
    fetchSuggestions(q) {
      if (!q || isUrlLike(q)) {
        this.suggestions = [];
        return;
      }
      if (this.currentJsonpScript && document.body.contains(this.currentJsonpScript)) {
        document.body.removeChild(this.currentJsonpScript);
      }

      const script = document.createElement('script');
      this.currentJsonpScript = script;
      const cbName = `google_search_suggest_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      window[cbName] = (data) => {
        if (Array.isArray(data) && Array.isArray(data[1])) {
          this.suggestions = data[1].slice(0, 8);
          this.showDropdown = true;
          this.$nextTick(this.updateDropdownCoords);
        }
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
      };

      script.src = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(q)}&callback=${cbName}`;
      script.onerror = () => {
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
      };
      document.body.appendChild(script);
    },
    navigateSuggestions(delta) {
      const total = this.suggestions.length;
      if (total === 0) return;
      this.selectedIndex = (this.selectedIndex + delta + total) % total;
      if (this.selectedIndex >= 0 && this.selectedIndex < total) {
        this.query = this.suggestions[this.selectedIndex];
      }
    },
    selectSuggestion(item) {
      this.query = item;
      this.closeSuggestions();
      this.executeSearch(item);
    },
    handleEnter() {
      if (this.selectedIndex >= 0 && this.selectedIndex < this.suggestions.length) {
        this.executeSearch(this.suggestions[this.selectedIndex]);
      } else {
        this.executeSearch(this.query);
      }
    },
    executeSearch(searchTerm) {
      const term = (searchTerm || '').trim();
      if (!term) return;
      this.closeSuggestions();

      // 1. 判断是否为网址：如 bilibili.com, localhost:8080, https://...
      if (isUrlLike(term)) {
        const url = /^https?:\/\//i.test(term) ? term : `https://${term}`;
        this.openUrl(url);
        return;
      }

      // 2. 否则保存历史并执行 Google 搜索
      this.saveHistory(term);
      const engineUrl = this.defaultEngine?.url || 'https://www.google.com/search?q=';
      const fullUrl = engineUrl + encodeURIComponent(term);
      this.openUrl(fullUrl);
    },
    searchWithEngine(engine, openingMethod) {
      const term = this.query.trim();
      if (!term) return;
      this.closeSuggestions();
      if (isUrlLike(term)) {
        const url = /^https?:\/\//i.test(term) ? term : `https://${term}`;
        this.openUrl(url, openingMethod);
        return;
      }
      this.saveHistory(term);
      const url = engine.url + encodeURIComponent(term);
      this.openUrl(url, openingMethod);
    },
    openUrl(url, method) {
      const finalMethod = method || this.openingMethod;
      switch (finalMethod) {
        case 'newtab':
          window.open(url, '_blank');
          break;
        case 'sametab':
          window.open(url, '_self');
          break;
        case 'workspace':
          router.push({ name: 'workspace', query: { url } });
          break;
        default:
          window.open(url, '_blank');
      }
    },
    highlightMatch(text, query) {
      if (!query) return text;
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      return text.replace(regex, '<strong>$1</strong>');
    },
  },
};
</script>

<style scoped lang="scss">
.custom-search {
  position: relative;
  width: 90%;
  max-width: 680px;
  margin: 0.8rem auto;
  font-family: inherit;

  .search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    background: var(--search-field-background, var(--item-background));
    border: 1px solid var(--outline-color, rgba(255, 255, 255, 0.2));
    border-radius: 28px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.2s ease-in-out;

    &:focus-within {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      border-color: var(--primary, #4285f4);
    }

    input {
      width: 100%;
      height: 44px;
      padding: 0 3.2rem 0 1.25rem;
      border: none;
      outline: none;
      background: transparent;
      color: var(--item-text-color, #ffffff);
      font-size: 1.05rem;
      border-radius: 28px;

      &::placeholder {
        color: var(--dim-text-color, rgba(255, 255, 255, 0.5));
      }
    }

    .clear-btn {
      position: absolute;
      right: 2.8rem;
      background: none;
      border: none;
      color: var(--dim-text-color, rgba(255, 255, 255, 0.6));
      font-size: 1rem;
      cursor: pointer;
      padding: 0.2rem 0.4rem;
      border-radius: 50%;
      line-height: 1;

      &:hover {
        color: var(--item-text-color, #ffffff);
      }
    }

    .search-btn {
      position: absolute;
      right: 0.5rem;
      background: none;
      border: none;
      color: var(--primary, #4285f4);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.4rem;
      cursor: pointer;
      border-radius: 50%;
      transition: transform 0.15s ease;

      &:hover {
        transform: scale(1.1);
      }
    }
  }

  .buttons {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 0.6rem;

    button {
      padding: 0.35rem 0.85rem;
      border: 1px solid var(--outline-color, rgba(255, 255, 255, 0.15));
      border-radius: 16px;
      color: var(--item-text-color);
      background: var(--item-background);
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: var(--item-background-hover);
        border-color: var(--primary);
      }
    }
  }
}
</style>

<!-- 全局浮动样式（Teleport 到 body，彻底跨越所有容器的 overflow 限制） -->
<style lang="scss">
.search-suggestions-dropdown-floating {
  position: absolute;
  background: var(--item-background, #1e2029);
  border: 1px solid var(--outline-color, rgba(255, 255, 255, 0.2));
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  z-index: 99999;
  overflow: hidden;
  padding: 0.3rem 0;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);

  .dropdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4rem 1rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--dim-text-color, rgba(255, 255, 255, 0.5));
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);

    .clear-history-btn {
      background: none;
      border: none;
      color: var(--warning, #ff5c5c);
      font-size: 0.75rem;
      cursor: pointer;
      padding: 0;

      &:hover {
        text-decoration: underline;
      }
    }
  }

  .suggestion-item {
    display: flex;
    align-items: center;
    padding: 0.55rem 1rem;
    cursor: pointer;
    font-size: 0.95rem;
    color: var(--item-text-color, #ffffff);
    transition: background 0.15s ease;

    &:hover, &.active {
      background: var(--item-background-hover, rgba(255, 255, 255, 0.12));
    }

    .icon {
      margin-right: 0.75rem;
      font-size: 0.85rem;
      opacity: 0.6;
    }

    .text {
      flex: 1;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      strong {
        color: var(--primary, #64b5f6);
      }
    }

    .delete-item-btn {
      background: none;
      border: none;
      color: var(--dim-text-color, rgba(255, 255, 255, 0.4));
      font-size: 1.1rem;
      cursor: pointer;
      padding: 0 0.4rem;
      line-height: 1;

      &:hover {
        color: var(--warning, #ff5c5c);
      }
    }
  }
}
</style>
