<template>
  <div class="podcast-player">
    <!-- 头部专辑信息 -->
    <div class="podcast-header" v-if="feedInfo">
      <img
        v-if="feedInfo.image"
        :src="feedInfo.image"
        class="podcast-cover"
        alt="Podcast Cover"
        @error="feedInfo.image = null"
      />
      <div class="podcast-meta">
        <h4 class="podcast-title">{{ feedInfo.title || '科技周报' }}</h4>
        <p class="podcast-desc" v-if="cleanDescription">{{ cleanDescription }}</p>
      </div>
    </div>

    <!-- 精致迷你播放卡片 -->
    <div class="player-card" v-if="currentTrack">
      <div class="track-info-row">
        <div class="status-indicator">
          <span class="live-dot" :class="{ playing: isPlaying }"></span>
          <span class="badge-text">{{ isPlaying ? 'Playing' : 'Ready' }}</span>
        </div>
        <span class="track-title" :title="currentTrack.title">{{ currentTrack.title }}</span>
      </div>

      <div class="controls-main">
        <!-- 核心大播放按钮 -->
        <button
          class="ctrl-btn play-toggle"
          @click="togglePlayCurrent"
          :title="isPlaying ? '暂停' : '播放'"
        >
          <svg v-if="!isPlaying" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
        </button>

        <!-- 进度条轨道与时间 -->
        <div class="timeline-container">
          <div class="slider-wrapper">
            <input
              type="range"
              min="0"
              :max="duration || 100"
              step="1"
              :value="currentTime"
              @input="seekAudio"
              class="custom-range"
              :style="progressStyle"
            />
          </div>
          <div class="time-meta">
            <span>{{ formatTime(currentTime) }}</span>
            <span>{{ formatTime(duration) }}</span>
          </div>
        </div>

        <!-- 音量/静音控制 -->
        <div class="volume-container">
          <button class="vol-btn" @click="toggleMute" :title="isMuted ? '取消静音' : '静音'">
            <svg v-if="isMuted || volume === 0" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>
            <svg v-else-if="volume < 0.5" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 隐藏的原生 audio 标签，负责解码和底层流传输 -->
      <audio
        ref="audioElement"
        :src="getPlayableUrl(currentTrack.audioUrl)"
        preload="metadata"
        @play="isPlaying = true"
        @pause="isPlaying = false"
        @ended="onEnded"
        @timeupdate="onTimeUpdate"
        @loadedmetadata="onLoadedMetadata"
      ></audio>
    </div>

    <!-- 剧集列表（倒序排列，最新在最上） -->
    <div class="episode-list" v-if="episodes && episodes.length > 0">
      <div
        v-for="(ep, idx) in episodes"
        :key="ep.guid || idx"
        :class="['episode-card', { active: currentTrack && currentTrack.audioUrl === ep.audioUrl }]"
        @click="playTrack(ep)"
      >
        <button
          class="list-play-btn"
          @click.stop="playTrack(ep)"
          :title="currentTrack && currentTrack.audioUrl === ep.audioUrl && isPlaying ? '暂停' : '播放'"
        >
          <svg v-if="currentTrack && currentTrack.audioUrl === ep.audioUrl && isPlaying" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>

        <div class="episode-content">
          <div class="episode-top-row">
            <span class="ep-title" :title="ep.title">{{ ep.title }}</span>
            <span class="ep-date">{{ formatDate(ep.pubDate) }}</span>
          </div>
          <p class="ep-desc" v-if="ep.description" :title="ep.description">{{ ep.description }}</p>
        </div>
      </div>
    </div>

    <div v-if="loading" class="player-loading">
      <div class="loading-spinner"></div>
      <span>正在加载播客节目...</span>
    </div>

    <div v-if="errorMsg && (!episodes || episodes.length === 0)" class="player-error">
      <span>{{ errorMsg }}</span>
    </div>
  </div>
</template>

<script>
import WidgetMixin from '@/mixins/WidgetMixin';
import ErrorHandler from '@/utils/logging/ErrorHandler';

export default {
  name: 'PodcastPlayer',
  mixins: [WidgetMixin],
  data() {
    return {
      feedInfo: null,
      episodes: [],
      currentTrack: null,
      isPlaying: false,
      isMuted: false,
      volume: 1,
      currentTime: 0,
      duration: 0,
      loading: true,
      errorMsg: null,
      currentJsonpScript: null,
    };
  },
  computed: {
    feedUrl() {
      return (
        this.options.feedUrl ||
        'https://muse.ai/podcasts/feed/1293396087193331/a5831f17-c3a9-4655-b854-ea0921c80e32'
      );
    },
    cleanDescription() {
      if (!this.feedInfo?.description) return '';
      return this.feedInfo.description
        .replace(/AI Generated/gi, '')
        .replace(/<[^>]*>?/gm, '')
        .trim();
    },
    progressPercent() {
      if (!this.duration || this.duration === 0) return 0;
      return Math.min(100, Math.max(0, (this.currentTime / this.duration) * 100));
    },
    progressStyle() {
      const p = this.progressPercent;
      return {
        background: `linear-gradient(to right, #3b82f6 0%, #60a5fa ${p}%, rgba(255, 255, 255, 0.15) ${p}%, rgba(255, 255, 255, 0.15) 100%)`,
      };
    },
  },
  mounted() {
    this.fetchPodcastData();
  },
  beforeUnmount() {
    if (this.currentJsonpScript && document.body.contains(this.currentJsonpScript)) {
      document.body.removeChild(this.currentJsonpScript);
    }
  },
  methods: {
    update() {
      this.fetchPodcastData();
    },
    cleanText(str) {
      if (!str) return '';
      return str
        .replace(/AI Generated/gi, '')
        .replace(/<[^>]*>?/gm, '')
        .trim();
    },
    getPlayableUrl(rawUrl) {
      if (!rawUrl) return '';
      return `/api/podcast-audio?url=${encodeURIComponent(rawUrl)}`;
    },
    onTimeUpdate() {
      const audio = this.$refs.audioElement;
      if (audio) {
        this.currentTime = Math.floor(audio.currentTime);
      }
    },
    onLoadedMetadata() {
      const audio = this.$refs.audioElement;
      if (audio && audio.duration) {
        this.duration = Math.floor(audio.duration);
      }
    },
    onEnded() {
      this.isPlaying = false;
      this.currentTime = 0;
    },
    seekAudio(e) {
      const targetTime = parseFloat(e.target.value);
      this.currentTime = targetTime;
      const audio = this.$refs.audioElement;
      if (audio) {
        audio.currentTime = targetTime;
      }
    },
    togglePlayCurrent() {
      if (!this.currentTrack) return;
      this.playTrack(this.currentTrack);
    },
    toggleMute() {
      const audio = this.$refs.audioElement;
      if (!audio) return;
      this.isMuted = !this.isMuted;
      audio.muted = this.isMuted;
    },
    fetchPodcastData() {
      this.loading = true;
      this.errorMsg = null;

      if (this.currentJsonpScript && document.body.contains(this.currentJsonpScript)) {
        document.body.removeChild(this.currentJsonpScript);
      }

      const cbName = `rss2json_cb_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const script = document.createElement('script');
      this.currentJsonpScript = script;

      window[cbName] = (data) => {
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        this.loading = false;

        if (data && data.status === 'ok') {
          this.feedInfo = data.feed || {};
          const rawItems = data.items || [];
          const parsed = rawItems.map((item) => {
            const enclosure = item.enclosure || {};
            return {
              title: item.title,
              pubDate: item.pubDate,
              timestamp: new Date(item.pubDate).getTime() || 0,
              guid: item.guid,
              description: this.cleanText(item.description),
              audioUrl: enclosure.link || enclosure.url || '',
            };
          }).filter((ep) => ep.audioUrl);

          parsed.sort((a, b) => b.timestamp - a.timestamp);
          this.episodes = parsed;

          if (this.episodes.length > 0 && !this.currentTrack) {
            this.currentTrack = this.episodes[0];
          }
        } else {
          this.errorMsg = data?.message || '获取播客订阅失败，请稍后刷新';
        }
      };

      script.onerror = () => {
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        this.loading = false;
        this.errorMsg = '网络连接异常，无法加载播客列表';
      };

      script.src = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(
        this.feedUrl
      )}&callback=${cbName}`;
      document.body.appendChild(script);
    },
    playTrack(ep) {
      if (this.currentTrack && this.currentTrack.audioUrl === ep.audioUrl) {
        const audio = this.$refs.audioElement;
        if (audio) {
          if (audio.paused) {
            audio.play().then(() => {
              this.isPlaying = true;
            }).catch(() => {});
          } else {
            audio.pause();
            this.isPlaying = false;
          }
        }
        return;
      }
      this.currentTrack = ep;
      this.currentTime = 0;
      this.duration = 0;
      this.$nextTick(() => {
        const audio = this.$refs.audioElement;
        if (audio) {
          audio.load();
          audio.play().then(() => {
            this.isPlaying = true;
          }).catch((e) => {
            ErrorHandler('Audio playback error', e);
          });
        }
      });
    },
    formatDate(dateStr) {
      if (!dateStr) return '';
      try {
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
        });
      } catch (e) {
        return dateStr;
      }
    },
    formatTime(seconds) {
      if (!seconds || Number.isNaN(seconds) || seconds < 0) return '00:00';
      const sec = Math.floor(seconds);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    },
  },
};
</script>

<style scoped lang="scss">
.podcast-player {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 0.2rem;
  color: var(--widget-text-color, var(--item-text-color, #fff));

  .podcast-header {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding-bottom: 0.65rem;
    border-bottom: 1px solid var(--outline-color, rgba(255, 255, 255, 0.08));

    .podcast-cover {
      width: 52px;
      height: 52px;
      border-radius: 12px;
      object-fit: cover;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
      flex-shrink: 0;
      transition: transform 0.2s ease;
      &:hover { transform: scale(1.05); }
    }

    .podcast-meta {
      flex: 1;
      min-width: 0;

      .podcast-title {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--item-text-color, #fff);
        letter-spacing: 0.2px;
      }

      .podcast-desc {
        margin: 0.3rem 0 0 0;
        font-size: 0.8rem;
        line-height: 1.4;
        opacity: 0.75;
      }
    }
  }

  /* 精致流线型播放卡片 */
  .player-card {
    background: linear-gradient(145deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    padding: 0.75rem 0.95rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(12px);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;

    .track-info-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;

      .status-indicator {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(255, 255, 255, 0.08);
        padding: 0.2rem 0.5rem;
        border-radius: 12px;
        flex-shrink: 0;

        .live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #94a3b8;
          transition: all 0.2s ease;

          &.playing {
            background: #22c55e;
            box-shadow: 0 0 8px #22c55e;
            animation: pulse 1.5s infinite;
          }
        }

        .badge-text {
          font-size: 0.68rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          opacity: 0.9;
        }
      }

      .track-title {
        font-size: 0.88rem;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        color: var(--item-text-color, #fff);
      }
    }

    .controls-main {
      display: flex;
      align-items: center;
      gap: 0.85rem;

      .play-toggle {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
        color: #ffffff !important;
        border: none !important;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        outline: none;
        flex-shrink: 0;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
        transition: transform 0.15s ease, box-shadow 0.15s ease;

        &:hover {
          transform: scale(1.08);
          box-shadow: 0 6px 16px rgba(37, 99, 235, 0.5);
        }

        svg {
          fill: currentColor;
          line-height: 1;
        }
      }

      .timeline-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;

        .slider-wrapper {
          position: relative;
          display: flex;
          align-items: center;

          .custom-range {
            -webkit-appearance: none;
            width: 100%;
            height: 5px;
            border-radius: 4px;
            outline: none;
            cursor: pointer;
            transition: height 0.1s ease;

            &::-webkit-slider-thumb {
              -webkit-appearance: none;
              width: 13px;
              height: 13px;
              border-radius: 50%;
              background: #ffffff;
              box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
              cursor: pointer;
              transition: transform 0.1s ease;
            }

            &:hover::-webkit-slider-thumb {
              transform: scale(1.25);
            }
          }
        }

        .time-meta {
          display: flex;
          justify-content: space-between;
          font-size: 0.7rem;
          opacity: 0.7;
          font-family: var(--font-monospace, monospace);
        }
      }

      .volume-container {
        display: flex;
        align-items: center;
        flex-shrink: 0;

        .vol-btn {
          background: rgba(255, 255, 255, 0.08);
          border: none;
          color: var(--item-text-color, #fff);
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease, transform 0.1s ease;

          &:hover {
            background: rgba(255, 255, 255, 0.15);
            transform: scale(1.05);
          }
        }
      }
    }
  }

  /* 剧集列表卡片 */
  .episode-list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    max-height: 290px;
    overflow-y: auto;
    padding-right: 0.25rem;

    &::-webkit-scrollbar {
      width: 4px;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 4px;
    }

    .episode-card {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 0.55rem 0.8rem;
      cursor: pointer;
      transition: all 0.18s ease;

      &:hover {
        background: rgba(255, 255, 255, 0.09);
        border-color: rgba(59, 130, 246, 0.4);
        transform: translateX(2px);
      }

      &.active {
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.12);
        box-shadow: 0 2px 10px rgba(59, 130, 246, 0.15);
      }

      .list-play-btn {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;
        transition: all 0.15s ease;

        svg {
          fill: currentColor;
        }

        &:hover {
          background: #2563eb;
          transform: scale(1.1);
        }
      }

      &.active .list-play-btn {
        background: #2563eb;
      }

      .episode-content {
        flex: 1;
        min-width: 0;

        .episode-top-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 0.5rem;

          .ep-title {
            font-size: 0.86rem;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--item-text-color, #fff);
          }

          .ep-date {
            font-size: 0.72rem;
            opacity: 0.55;
            flex-shrink: 0;
          }
        }

        .ep-desc {
          margin: 0.2rem 0 0 0;
          font-size: 0.74rem;
          line-height: 1.35;
          opacity: 0.65;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }
    }
  }

  .player-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    padding: 1.5rem 0;
    opacity: 0.75;

    .loading-spinner {
      width: 24px;
      height: 24px;
      border: 2px solid rgba(255, 255, 255, 0.15);
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  }

  .player-error {
    text-align: center;
    font-size: 0.82rem;
    padding: 1rem 0;
    color: var(--warning, #ff5c5c);
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.15); }
}
</style>
