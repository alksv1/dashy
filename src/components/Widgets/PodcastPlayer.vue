<template>
  <div class="podcast-player">
    <!-- 头部信息 -->
    <div class="podcast-header" v-if="feedInfo">
      <img
        v-if="feedInfo.image"
        :src="feedInfo.image"
        class="podcast-cover"
        alt="Podcast Cover"
        @error="feedInfo.image = null"
      />
      <div class="podcast-meta">
        <h4 class="podcast-title">{{ feedInfo.title || 'Muse Podcast' }}</h4>
        <p class="podcast-desc" v-if="feedInfo.description">{{ feedInfo.description }}</p>
      </div>
    </div>

    <!-- 当前播放器控制条 -->
    <div class="current-player" v-if="currentTrack">
      <div class="current-title-row">
        <span class="playing-badge">Now Playing</span>
        <span class="current-title">{{ currentTrack.title }}</span>
      </div>
      <audio
        ref="audioElement"
        :src="currentTrack.audioUrl"
        controls
        autoplay
        class="audio-bar"
      ></audio>
    </div>

    <!-- 剧集列表 -->
    <div class="episode-list" v-if="episodes && episodes.length > 0">
      <div
        v-for="(ep, idx) in episodes"
        :key="ep.guid || idx"
        :class="['episode-card', { active: currentTrack && currentTrack.audioUrl === ep.audioUrl }]"
      >
        <div class="episode-main">
          <div class="episode-top-row">
            <span class="ep-title">{{ ep.title }}</span>
            <span class="ep-date">{{ formatDate(ep.pubDate) }}</span>
          </div>
          <p class="ep-desc" v-if="ep.description">{{ ep.description }}</p>
        </div>

        <div class="episode-actions">
          <button
            class="play-btn"
            @click="playTrack(ep)"
            :title="currentTrack && currentTrack.audioUrl === ep.audioUrl ? 'Playing' : 'Play Episode'"
          >
            <span v-if="currentTrack && currentTrack.audioUrl === ep.audioUrl && isPlaying">⏸</span>
            <span v-else>▶</span>
            <span class="play-label">
              {{ currentTrack && currentTrack.audioUrl === ep.audioUrl && isPlaying ? 'Pause' : 'Play' }}
            </span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="player-loading">
      <span>Loading podcast episodes...</span>
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
      return this.options.limit || 10;
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
          this.episodes = rawItems.map((item) => {
            const enclosure = item.enclosure || {};
            return {
              title: item.title,
              pubDate: item.pubDate,
              guid: item.guid,
              description: (item.description || '').replace(/<[^>]*>?/gm, '').trim(),
              audioUrl: enclosure.link || enclosure.url || '',
              duration: enclosure.duration || null,
            };
          }).filter((ep) => ep.audioUrl);

          if (this.episodes.length > 0 && !this.currentTrack) {
            this.currentTrack = this.episodes[0];
          }
        } else {
          this.errorMsg = 'Failed to load podcast feed.';
        }
      } catch (err) {
        this.errorMsg = 'Error fetching podcast episodes.';
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
            audio.play();
            this.isPlaying = true;
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
          audio.play().catch(() => {});
          this.isPlaying = true;
        }
      });
    },
    formatDate(dateStr) {
      if (!dateStr) return '';
      try {
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString(navigator.language || 'zh-CN', {
          year: 'numeric',
          month: 'short',
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
  padding: 0.4rem;
  color: var(--widget-text-color, var(--item-text-color, #fff));

  .podcast-header {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--outline-color, rgba(255, 255, 255, 0.12));

    .podcast-cover {
      width: 54px;
      height: 54px;
      border-radius: 8px;
      object-fit: cover;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    }

    .podcast-meta {
      flex: 1;
      min-width: 0;

      .podcast-title {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .podcast-desc {
        margin: 0.2rem 0 0 0;
        font-size: 0.8rem;
        opacity: 0.75;
        white-space: pre-line;
        max-height: 2.4rem;
        overflow: hidden;
        text-overflow: ellipsis;
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
      gap: 0.5rem;
      margin-bottom: 0.5rem;

      .playing-badge {
        font-size: 0.7rem;
        font-weight: bold;
        text-transform: uppercase;
        background: var(--primary, #4285f4);
        color: #fff;
        padding: 0.15rem 0.4rem;
        border-radius: 4px;
        letter-spacing: 0.5px;
      }

      .current-title {
        font-size: 0.9rem;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
      }
    }

    .audio-bar {
      width: 100%;
      height: 36px;
      border-radius: 6px;
      outline: none;
    }
  }

  .episode-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 280px;
    overflow-y: auto;
    padding-right: 0.2rem;

    .episode-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.6rem;
      background: var(--item-background, rgba(255, 255, 255, 0.04));
      border: 1px solid var(--outline-color, rgba(255, 255, 255, 0.08));
      border-radius: 8px;
      padding: 0.5rem 0.7rem;
      transition: all 0.15s ease-in-out;

      &:hover {
        background: var(--item-background-hover, rgba(255, 255, 255, 0.1));
        border-color: var(--primary, #4285f4);
      }

      &.active {
        border-color: var(--primary, #4285f4);
        background: rgba(66, 133, 244, 0.1);
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
          }

          .ep-date {
            font-size: 0.75rem;
            opacity: 0.6;
            flex-shrink: 0;
          }
        }

        .ep-desc {
          margin: 0.2rem 0 0 0;
          font-size: 0.75rem;
          opacity: 0.7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }

      .episode-actions {
        flex-shrink: 0;

        .play-btn {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          background: var(--primary, #4285f4);
          color: #fff;
          border: none;
          border-radius: 16px;
          padding: 0.3rem 0.65rem;
          font-size: 0.78rem;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.1s ease, filter 0.15s ease;

          &:hover {
            filter: brightness(1.15);
            transform: scale(1.05);
          }

          .play-label {
            display: inline-block;
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
