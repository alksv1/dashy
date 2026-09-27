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
        <p class="podcast-desc" v-if="feedInfo.description">{{ cleanText(feedInfo.description) }}</p>
      </div>
    </div>

    <!-- 当前播放器控制条 -->
    <div class="current-player" v-if="currentTrack">
      <div class="current-title-row">
        <span class="playing-badge">Now Playing</span>
        <span class="current-title" :title="currentTrack.title">{{ currentTrack.title }}</span>
      </div>
      <audio
        ref="audioElement"
        :src="currentTrack.audioUrl"
        controls
        preload="metadata"
        class="audio-bar"
      ></audio>
    </div>

    <!-- 剧集列表（按发布时间倒序排列，最新期在最上） -->
    <div class="episode-list" v-if="episodes && episodes.length > 0">
      <div
        v-for="(ep, idx) in episodes"
        :key="ep.guid || idx"
        :class="['episode-card', { active: currentTrack && currentTrack.audioUrl === ep.audioUrl }]"
      >
        <div class="episode-main">
          <div class="episode-top-row">
            <span class="ep-title" :title="ep.title">{{ ep.title }}</span>
            <span class="ep-date">{{ formatDate(ep.pubDate) }}</span>
          </div>
          <p class="ep-desc" v-if="ep.description" :title="ep.description">{{ ep.description }}</p>
        </div>

        <div class="episode-actions">
          <button
            class="play-btn"
            @click="playTrack(ep)"
            :title="currentTrack && currentTrack.audioUrl === ep.audioUrl && isPlaying ? '暂停' : '播放这期'"
          >
            <span class="btn-icon">
              {{ currentTrack && currentTrack.audioUrl === ep.audioUrl && isPlaying ? '⏸' : '▶' }}
            </span>
            <span class="btn-text">
              {{ currentTrack && currentTrack.audioUrl === ep.audioUrl && isPlaying ? '暂停' : '播放' }}
            </span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="player-loading">
      <span>正在加载播客节目...</span>
    </div>

    <div v-if="errorMsg && (!episodes || episodes.length === 0)" class="player-error">
      <span>{{ errorMsg }}</span>
    </div>
  </div>
</template>

<script>
import WidgetMixin from '@/mixins/WidgetMixin';
import request from '@/utils/request';
import { widgetApiEndpoints } from '@/utils/config/defaults';

export default {
  name: 'PodcastPlayer',
  mixins: [WidgetMixin],
  data() {
    return {
      feedInfo: null,
      episodes: [],
      currentTrack: null,
      isPlaying: false,
      loading: true,
      errorMsg: null,
    };
  },
  computed: {
    feedUrl() {
      return (
        this.options.feedUrl ||
        'https://muse.ai/podcasts/feed/1293396087193331/a5831f17-c3a9-4655-b854-ea0921c80e32'
      );
    },
    limit() {
      return this.options.limit || 15;
    },
  },
  mounted() {
    this.fetchPodcastData();
    this.$nextTick(() => {
      this.attachAudioListeners();
    });
  },
  methods: {
    update() {
      this.fetchPodcastData();
    },
    cleanText(str) {
      if (!str) return '';
      return str.replace(/<[^>]*>?/gm, '').trim();
    },
    attachAudioListeners() {
      const audio = this.$refs.audioElement;
      if (!audio) return;
      audio.onplay = () => {
        this.isPlaying = true;
      };
      audio.onpause = () => {
        this.isPlaying = false;
      };
      audio.onended = () => {
        this.isPlaying = false;
      };
    },
    async fetchPodcastData() {
      this.loading = true;
      this.errorMsg = null;
      try {
        const apiUrl = `${widgetApiEndpoints.rssToJson}?rss_url=${encodeURIComponent(
          this.feedUrl
        )}&count=${this.limit}`;
        const res = await request.get(apiUrl);
        if (res.data && res.data.status === 'ok') {
          this.feedInfo = res.data.feed || {};
          const rawItems = res.data.items || [];
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

          // 核心：强制按发布时间从新到旧倒序排序（最新的在最上面）
          parsed.sort((a, b) => b.timestamp - a.timestamp);
          this.episodes = parsed;

          if (this.episodes.length > 0 && !this.currentTrack) {
            this.currentTrack = this.episodes[0];
          }
        } else {
          this.errorMsg = '获取播客订阅失败，请稍后刷新';
        }
      } catch (err) {
        this.errorMsg = '网络连接异常，无法加载播客列表';
      } finally {
        this.loading = false;
        this.$nextTick(() => {
          this.attachAudioListeners();
        });
      }
    },
    playTrack(ep) {
      if (this.currentTrack && this.currentTrack.audioUrl === ep.audioUrl) {
        const audio = this.$refs.audioElement;
        if (audio) {
          if (audio.paused) {
            const playPromise = audio.play();
            if (playPromise !== undefined) {
              playPromise.then(() => {
                this.isPlaying = true;
              }).catch(() => {
                this.isPlaying = false;
              });
            }
          } else {
            audio.pause();
            this.isPlaying = false;
          }
        }
        return;
      }
      this.currentTrack = ep;
      this.$nextTick(() => {
        const audio = this.$refs.audioElement;
        if (audio) {
          this.attachAudioListeners();
          audio.load();
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              this.isPlaying = true;
            }).catch(() => {
              this.isPlaying = false;
            });
          }
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
  },
};
</script>

<style scoped lang="scss">
.podcast-player {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 0.2rem;
  color: var(--widget-text-color, var(--item-text-color, #fff));

  .podcast-header {
    display: flex;
    align-items: flex-start;
    gap: 0.8rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--outline-color, rgba(255, 255, 255, 0.12));

    .podcast-cover {
      width: 58px;
      height: 58px;
      border-radius: 10px;
      object-fit: cover;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
      flex-shrink: 0;
    }

    .podcast-meta {
      flex: 1;
      min-width: 0;

      .podcast-title {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 600;
        color: var(--item-text-color, #fff);
      }

      .podcast-desc {
        margin: 0.35rem 0 0 0;
        font-size: 0.82rem;
        line-height: 1.4;
        opacity: 0.8;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
    }
  }

  .current-player {
    background: var(--item-background, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--outline-color, rgba(255, 255, 255, 0.15));
    border-radius: 10px;
    padding: 0.6rem 0.8rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);

    .current-title-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-bottom: 0.5rem;

      .playing-badge {
        font-size: 0.68rem;
        font-weight: bold;
        text-transform: uppercase;
        background: #2563eb;
        color: #ffffff !important;
        padding: 0.2rem 0.45rem;
        border-radius: 4px;
        letter-spacing: 0.5px;
        flex-shrink: 0;
      }

      .current-title {
        font-size: 0.88rem;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        color: var(--item-text-color, #fff);
      }
    }

    .audio-bar {
      width: 100%;
      height: 38px;
      border-radius: 6px;
      outline: none;
    }
  }

  .episode-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 300px;
    overflow-y: auto;
    padding-right: 0.2rem;

    .episode-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.6rem;
      background: var(--item-background, rgba(255, 255, 255, 0.05));
      border: 1px solid var(--outline-color, rgba(255, 255, 255, 0.1));
      border-radius: 8px;
      padding: 0.55rem 0.75rem;
      transition: all 0.15s ease-in-out;

      &:hover {
        background: var(--item-background-hover, rgba(255, 255, 255, 0.12));
        border-color: var(--primary, #3b82f6);
      }

      &.active {
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.15);
      }

      .episode-main {
        flex: 1;
        min-width: 0;

        .episode-top-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 0.5rem;

          .ep-title {
            font-size: 0.88rem;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--item-text-color, #fff);
          }

          .ep-date {
            font-size: 0.74rem;
            opacity: 0.6;
            flex-shrink: 0;
          }
        }

        .ep-desc {
          margin: 0.25rem 0 0 0;
          font-size: 0.75rem;
          line-height: 1.35;
          opacity: 0.7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }

      .episode-actions {
        flex-shrink: 0;

        .play-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          background: #2563eb !important;
          color: #ffffff !important;
          border: none !important;
          border-radius: 20px;
          padding: 0.35rem 0.75rem;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.1s ease, background 0.15s ease;
          outline: none;

          &:hover {
            background: #1d4ed8 !important;
            transform: scale(1.05);
          }

          .btn-icon {
            font-size: 0.75rem;
            color: #ffffff !important;
          }

          .btn-text {
            color: #ffffff !important;
          }
        }
      }
    }
  }

  .player-loading,
  .player-error {
    text-align: center;
    font-size: 0.85rem;
    padding: 0.8rem 0;
    opacity: 0.75;
  }

  .player-error {
    color: var(--warning, #ff5c5c);
  }
}
</style>
