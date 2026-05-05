/**
 * StreamFlow Video Player
 * High-quality streaming video player with smart buffering
 */

class StreamFlowPlayer {
    constructor() {
        // DOM Elements
        this.urlSection = document.getElementById('urlSection');
        this.playerSection = document.getElementById('playerSection');
        this.playerContainer = document.getElementById('playerContainer');
        this.video = document.getElementById('videoPlayer');
        this.urlInput = document.getElementById('videoUrl');
        this.loadBtn = document.getElementById('loadBtn');
        this.backBtn = document.getElementById('backBtn');
        this.useProxyCheckbox = document.getElementById('useProxy');

        // Overlays
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.playOverlay = document.getElementById('playOverlay');
        this.errorOverlay = document.getElementById('errorOverlay');
        this.errorText = document.getElementById('errorText');
        this.bufferIndicator = document.getElementById('bufferIndicator');

        // Controls
        this.controls = document.getElementById('controls');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.bigPlayBtn = document.getElementById('bigPlayBtn');
        this.skipBackBtn = document.getElementById('skipBackBtn');
        this.skipForwardBtn = document.getElementById('skipForwardBtn');
        this.muteBtn = document.getElementById('muteBtn');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeFill = document.getElementById('volumeFill');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.pipBtn = document.getElementById('pipBtn');
        this.speedBtn = document.getElementById('speedBtn');
        this.speedMenu = document.getElementById('speedMenu');
        this.speedValue = document.getElementById('speedValue');
        this.retryBtn = document.getElementById('retryBtn');

        // Progress
        this.progressContainer = document.getElementById('progressContainer');
        this.progressBuffer = document.getElementById('progressBuffer');
        this.progressPlayed = document.getElementById('progressPlayed');
        this.progressThumb = document.getElementById('progressThumb');
        this.progressTooltip = document.getElementById('progressTooltip');

        // Time Display
        this.currentTimeEl = document.getElementById('currentTime');
        this.durationEl = document.getElementById('duration');
        this.timeDisplay = document.getElementById('timeDisplay');
        this.timeInputWrapper = document.getElementById('timeInputWrapper');
        this.timeInput = document.getElementById('timeInput');
        this.timeGoBtn = document.getElementById('timeGoBtn');

        // Stats
        this.bufferPercent = document.getElementById('bufferPercent');
        this.networkSpeed = document.getElementById('networkSpeed');

        // Shortcuts Modal
        this.shortcutsModal = document.getElementById('shortcutsModal');
        this.closeShortcuts = document.getElementById('closeShortcuts');

        // Settings Menu
        this.settingsBtn = document.getElementById('settingsBtn');
        this.settingsMenu = document.getElementById('settingsMenu');
        this.settingsContainer = document.getElementById('settingsContainer');
        this.audioTrackOptions = document.getElementById('audioTrackOptions');
        this.subtitleOptions = document.getElementById('subtitleOptions');
        this.seekDurationOptions = document.getElementById('seekDurationOptions');

        // Lock
        this.lockBtn = document.getElementById('lockBtn');
        this.lockOverlay = document.getElementById('lockOverlay');
        this.lockUnlockBtn = document.getElementById('lockUnlockBtn');

        // State
        this.isPlaying = false;
        this.isMuted = false;
        this.isFullscreen = false;
        this.isLocked = false;
        this.controlsTimeout = null;
        this.cursorTimeout = null;
        this.lastVolume = 1;
        this.currentUrl = '';
        this.loadStartTime = 0;
        this.bytesLoaded = 0;
        this.seekDuration = parseInt(localStorage.getItem('seekDuration')) || 5;

        // HLS instance reference for track management
        this.hlsInstance = null;

        // Buffer Management
        this.bufferCheckInterval = null;
        this.targetBufferAhead = 60;
        this.historyBufferRatio = 0.10;
        this.maxWatchedPosition = 0;
        this.bufferRanges = [];

        // Network speed tracking
        this.lastBufferTime = 0;
        this.lastBufferedAmount = 0;
        this.networkSpeedSamples = [];
        this.maxSpeedSamples = 10;

        // Range request support detection
        this.supportsRangeRequests = null;
        this.rangeRequestChecked = false;

        this.init();
    }

    init() {
        this.bindEvents();
        this.setupVideoEvents();
        this.updateVolumeUI();
        this.applySeekDuration(this.seekDuration);

        // Focus input on load
        this.urlInput.focus();

        // Check for URL in query params
        const params = new URLSearchParams(window.location.search);
        const videoUrl = params.get('url');
        if (videoUrl) {
            this.urlInput.value = decodeURIComponent(videoUrl);
            this.loadVideo();
        }
    }

    bindEvents() {
        // URL Input
        this.loadBtn.addEventListener('click', () => this.loadVideo());
        this.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.loadVideo();
        });
        this.backBtn.addEventListener('click', () => this.showUrlSection());
        this.retryBtn.addEventListener('click', () => this.loadVideo());

        // Play Controls
        this.playPauseBtn.addEventListener('click', () => this.togglePlay());
        this.bigPlayBtn.addEventListener('click', () => this.togglePlay());
        this.skipBackBtn.addEventListener('click', () => this.skip(-this.seekDuration));
        this.skipForwardBtn.addEventListener('click', () => this.skip(this.seekDuration));

        // Volume
        this.muteBtn.addEventListener('click', () => this.toggleMute());
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));

        // Progress Bar
        this.progressContainer.addEventListener('click', (e) => this.seek(e));
        this.progressContainer.addEventListener('mousemove', (e) => this.updateTooltip(e));

        // Add drag support for progress bar
        let isDragging = false;
        this.progressContainer.addEventListener('mousedown', (e) => {
            isDragging = true;
            this.seek(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                this.seek(e);
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // Fullscreen & PiP
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        this.pipBtn.addEventListener('click', () => this.togglePiP());

        // Time Input - click time display to show input
        this.timeDisplay.addEventListener('click', () => this.showTimeInput());
        this.timeGoBtn.addEventListener('click', () => this.jumpToInputTime());
        this.timeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.jumpToInputTime();
        });
        this.timeInput.addEventListener('blur', () => {
            // Hide input after a short delay (allows clicking Go button)
            setTimeout(() => this.hideTimeInput(), 200);
        });

        // Speed Menu
        this.speedBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.speedMenu.classList.toggle('active');
        });

        document.querySelectorAll('.speed-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const speed = parseFloat(e.target.dataset.speed);
                this.setPlaybackSpeed(speed);
            });
        });

        // Custom speed input
        const customSpeedInput = document.getElementById('customSpeedInput');
        const customSpeedBtn = document.getElementById('customSpeedBtn');

        if (customSpeedBtn && customSpeedInput) {
            customSpeedBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const speed = parseFloat(customSpeedInput.value);
                if (speed >= 0.1 && speed <= 100) {
                    this.setPlaybackSpeed(speed);
                    customSpeedInput.value = '';
                }
            });

            customSpeedInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.stopPropagation();
                    const speed = parseFloat(customSpeedInput.value);
                    if (speed >= 0.1 && speed <= 100) {
                        this.setPlaybackSpeed(speed);
                        customSpeedInput.value = '';
                    }
                }
            });

            customSpeedInput.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // Close speed menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.speedMenu.contains(e.target) && e.target !== this.speedBtn) {
                this.speedMenu.classList.remove('active');
            }
            if (this.settingsContainer && !this.settingsContainer.contains(e.target)) {
                this.settingsMenu.classList.remove('active');
            }
        });

        // Settings Menu
        this.settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.settingsMenu.classList.toggle('active');
            this.speedMenu.classList.remove('active');
        });

        // Seek Duration buttons
        this.seekDurationOptions.querySelectorAll('.seek-duration-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const dur = parseInt(e.target.dataset.seek);
                this.applySeekDuration(dur);
            });
        });

        // Lock Button
        this.lockBtn.addEventListener('click', () => this.toggleLock());
        this.lockUnlockBtn.addEventListener('click', () => this.toggleLock());

        // External subtitle file input
        const subtitleFileInput = document.getElementById('subtitleFileInput');
        if (subtitleFileInput) {
            subtitleFileInput.addEventListener('change', (e) => {
                e.stopPropagation();
                this.loadSubtitleFile(e.target.files[0]);
            });
        }

        // External subtitle URL
        const subtitleUrlGo = document.getElementById('subtitleUrlGo');
        const subtitleUrlInput = document.getElementById('subtitleUrlInput');
        if (subtitleUrlGo && subtitleUrlInput) {
            subtitleUrlGo.addEventListener('click', (e) => {
                e.stopPropagation();
                this.loadSubtitleFromUrl(subtitleUrlInput.value.trim());
                subtitleUrlInput.value = '';
            });
            subtitleUrlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.stopPropagation();
                    this.loadSubtitleFromUrl(subtitleUrlInput.value.trim());
                    subtitleUrlInput.value = '';
                }
            });
            subtitleUrlInput.addEventListener('click', (e) => e.stopPropagation());
        }
        // Shortcuts Modal
        this.closeShortcuts.addEventListener('click', () => {
            this.shortcutsModal.classList.remove('active');
        });

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Controls visibility
        this.playerContainer.addEventListener('mousemove', () => this.showControls());
        this.playerContainer.addEventListener('mouseleave', () => this.hideControls());

        // Click to play/pause (only if not locked)
        this.video.addEventListener('click', () => {
            if (!this.isLocked) this.togglePlay();
        });

        // Double-click to fullscreen (only if not locked)
        this.video.addEventListener('dblclick', () => {
            if (!this.isLocked) this.toggleFullscreen();
        });

        // Fullscreen change
        document.addEventListener('fullscreenchange', () => this.onFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.onFullscreenChange());
    }

    setupVideoEvents() {
        // Loading states
        this.video.addEventListener('loadstart', () => {
            this.loadStartTime = Date.now();
            this.maxWatchedPosition = 0; // Reset watched position
            this.bufferRanges = [];
            this.showLoading();
        });

        this.video.addEventListener('loadedmetadata', () => {
            // Clear load timeout
            if (this.loadTimeout) {
                clearTimeout(this.loadTimeout);
                this.loadTimeout = null;
            }

            this.durationEl.textContent = this.formatTime(this.video.duration);
            this.hideLoading();
            // Start buffer management once we have metadata
            this.startBufferManagement();
            // Initialize speed status
            this.updateSpeedStatus();
            // Detect audio tracks and subtitles
            this.detectTracks();

            console.log(`Video loaded: ${this.formatTime(this.video.duration)} duration`);
        });

        this.video.addEventListener('canplay', () => {
            this.hideLoading();
            this.playOverlay.classList.remove('hidden');
        });

        this.video.addEventListener('canplaythrough', () => {
            this.hideLoading();
        });

        this.video.addEventListener('waiting', () => {
            this.showLoading();
        });

        this.video.addEventListener('playing', () => {
            this.hideLoading();
            this.isPlaying = true;
            this.playerContainer.classList.add('playing');
            this.playOverlay.classList.add('hidden');
        });

        this.video.addEventListener('pause', () => {
            this.isPlaying = false;
            this.playerContainer.classList.remove('playing');
            // Continue buffering even when paused - browser handles this
            // but we update the UI to show buffer progress
            this.updateBuffer();
        });

        this.video.addEventListener('ended', () => {
            this.isPlaying = false;
            this.playerContainer.classList.remove('playing');
            this.playOverlay.classList.remove('hidden');
        });

        // Time update
        this.video.addEventListener('timeupdate', () => {
            this.updateProgress();
            // Track max watched position for history buffer
            if (this.video.currentTime > this.maxWatchedPosition) {
                this.maxWatchedPosition = this.video.currentTime;
            }
        });

        // Buffer progress - fires when browser downloads more data
        this.video.addEventListener('progress', () => this.updateBuffer());

        // Also update buffer on seeking + fix audio desync
        this.video.addEventListener('seeked', () => {
            this.updateBuffer();
            // Force audio resync: pause/play cycle fixes decoder desync
            if (!this.video.paused && !this.video.ended) {
                this.video.pause();
                requestAnimationFrame(() => {
                    this.video.play().catch(() => {});
                });
            }
        });

        // Detect text tracks added asynchronously
        this.video.textTracks.addEventListener('addtrack', () => {
            this.populateSubtitles();
        });

        // Error handling
        this.video.addEventListener('error', (e) => this.handleError(e));

        // Volume change
        this.video.addEventListener('volumechange', () => this.updateVolumeUI());
    }

    loadVideo() {
        let url = this.urlInput.value.trim();
        if (!url) {
            this.urlInput.focus();
            return;
        }

        // Check if proxy should be used
        const useProxy = this.useProxyCheckbox && this.useProxyCheckbox.checked;
        if (useProxy) {
            // Use proxy endpoint (works with both local server.js and Vercel serverless function)
            const proxyBase = window.location.hostname === 'localhost'
                ? 'http://localhost:4000/proxy'
                : '/api/proxy';
            url = `${proxyBase}?url=${encodeURIComponent(url)}`;
            console.log('🔄 Using proxy server for URL');
        }

        this.currentUrl = url;
        this.originalUrl = this.urlInput.value.trim(); // Store original for display
        this.hideError();
        this.showPlayerSection();
        this.showLoading();

        // Reset network speed tracking
        this.lastBufferTime = 0;
        this.lastBufferedAmount = 0;
        this.networkSpeedSamples = [];
        this.loadStartTime = Date.now();

        // Reset CORS retry flags
        this.triedWithoutCors = false;
        this.triedWithCors = false;
        this.rangeRequestChecked = false;

        // Check if HLS stream
        if (url.includes('.m3u8')) {
            this.loadHLS(url);
        } else if (url.includes('.mpd')) {
            this.loadDASH(url);
        } else {
            // Direct video URL - try loading with best settings for streaming
            this.loadDirectVideo(url);
        }

        // Update URL params
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('url', encodeURIComponent(url));
        window.history.replaceState({}, '', newUrl);
    }

    async loadDirectVideo(url) {
        // Reset video element for fresh load
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.load();

        // Configure for streaming
        this.video.preload = 'auto';

        // Check if it's a Google URL (they have specific requirements)
        const isGoogleUrl = url.includes('googleusercontent.com') ||
            url.includes('googlevideo.com') ||
            url.includes('google.com');

        if (isGoogleUrl) {
            console.log('🔗 Detected Google video URL - may expire after a few hours');
            // Google URLs work better without crossorigin attribute
            this.video.removeAttribute('crossorigin');
        }

        // Check if server supports Range requests (for seeking)
        if (!this.rangeRequestChecked) {
            this.checkRangeRequestSupport(url);
        }

        // Set the source and load
        this.video.src = url;
        this.video.load();

        // Add timeout for stuck loading
        this.loadTimeout = setTimeout(() => {
            if (this.video.readyState < 2) { // HAVE_CURRENT_DATA
                console.warn('Video loading is taking too long...');
                // Try without any special attributes
                this.video.removeAttribute('crossorigin');
                this.video.load();
            }
        }, 10000); // 10 second timeout
    }

    async checkRangeRequestSupport(url) {
        this.rangeRequestChecked = true;

        try {
            const response = await fetch(url, {
                method: 'HEAD',
                mode: 'cors'
            });

            const acceptRanges = response.headers.get('Accept-Ranges');
            const contentLength = response.headers.get('Content-Length');

            this.supportsRangeRequests = acceptRanges === 'bytes';

            if (this.supportsRangeRequests) {
                console.log(`✅ Server supports Range requests (byte-seeking enabled)`);
                if (contentLength) {
                    const sizeMB = (parseInt(contentLength) / 1024 / 1024).toFixed(1);
                    console.log(`📦 File size: ${sizeMB} MB`);
                }
            } else {
                console.warn(`⚠️ Server doesn't support Range requests - seeking may require re-download`);
                this.showRangeWarning();
            }
        } catch (error) {
            console.warn('Could not check Range request support:', error.message);
            // Assume it works - browser will handle it
            this.supportsRangeRequests = true;
        }
    }

    showRangeWarning() {
        // Show a subtle warning that seeking might not work well
        const warning = document.createElement('div');
        warning.className = 'range-warning';
        warning.innerHTML = `
            <span>⚠️ This video may not support seeking to unbuffered positions</span>
        `;
        warning.style.cssText = `
            position: absolute;
            top: 70px;
            right: 20px;
            padding: 10px 16px;
            background: rgba(255, 165, 0, 0.9);
            color: #000;
            border-radius: 8px;
            font-size: 0.85rem;
            z-index: 20;
            animation: slideInRight 0.3s ease, fadeOut 0.3s ease 4s forwards;
        `;

        this.playerContainer.appendChild(warning);

        setTimeout(() => {
            warning.remove();
        }, 5000);
    }

    loadHLS(url) {
        // Check if native HLS is supported (Safari)
        if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
            this.video.src = url;
            this.video.load();
        } else if (typeof Hls !== 'undefined') {
            // Use hls.js for other browsers
            if (this.hlsInstance) {
                this.hlsInstance.destroy();
            }
            const hls = new Hls({
                maxBufferLength: 60,
                maxMaxBufferLength: 120,
                maxBufferSize: 60 * 1000 * 1000, // 60MB
                maxBufferHole: 0.5,
            });
            this.hlsInstance = hls;
            hls.loadSource(url);
            hls.attachMedia(this.video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                this.hideLoading();
                this.detectTracks();
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    this.showError('HLS stream error: ' + data.type);
                }
            });
        } else {
            this.showError('HLS playback not supported. Please use Safari or add hls.js library.');
        }
    }

    loadDASH(url) {
        if (typeof dashjs !== 'undefined') {
            const player = dashjs.MediaPlayer().create();
            player.initialize(this.video, url, false);
            player.updateSettings({
                streaming: {
                    buffer: {
                        fastSwitchEnabled: true,
                        bufferTimeAtTopQuality: 30,
                        bufferTimeAtTopQualityLongForm: 60,
                    }
                }
            });
        } else {
            this.showError('DASH playback requires dash.js library.');
        }
    }

    togglePlay() {
        if (this.video.paused) {
            this.video.play().catch(e => {
                console.error('Play error:', e);
            });
        } else {
            this.video.pause();
        }
    }

    skip(seconds) {
        const newTime = this.video.currentTime + seconds;
        this.seekToTime(newTime);

        // Show seek indicator
        this.showSeekIndicator(seconds);
    }

    showSeekIndicator(seconds) {
        // Create indicator if doesn't exist
        let indicator = document.querySelector(`.seek-indicator.${seconds < 0 ? 'left' : 'right'}`);
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = `seek-indicator ${seconds < 0 ? 'left' : 'right'}`;
            this.playerContainer.appendChild(indicator);
        }

        indicator.textContent = `${seconds > 0 ? '+' : ''}${seconds}s`;
        indicator.classList.remove('active');
        void indicator.offsetWidth; // Force reflow
        indicator.classList.add('active');
    }

    seek(e) {
        const rect = this.progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const clampedPos = Math.max(0, Math.min(1, pos));
        this.seekToTime(clampedPos * this.video.duration);
    }

    seekToTime(targetTime) {
        if (!this.video.duration) return;

        // Check if target is within buffered range
        const isBuffered = this.isTimeBuffered(targetTime);

        if (!isBuffered) {
            // Show loading indicator for unbuffered seek
            this.showLoading();

            const timeStr = this.formatTime(targetTime);

            if (this.supportsRangeRequests === false) {
                console.warn(`⚠️ Seeking to ${timeStr} - server may not support Range requests`);
            } else {
                console.log(`🎯 Seeking to ${timeStr} - requesting chunk via HTTP Range header`);
            }

            // For Google URLs, add a note
            const isGoogleUrl = this.currentUrl.includes('googleusercontent.com');
            if (isGoogleUrl && !isBuffered) {
                console.log(`📥 Note: Google URLs support seeking, but may expire soon`);
            }
        }

        this.video.currentTime = Math.max(0, Math.min(targetTime, this.video.duration));
    }

    isTimeBuffered(time) {
        for (let i = 0; i < this.video.buffered.length; i++) {
            if (time >= this.video.buffered.start(i) && time <= this.video.buffered.end(i)) {
                return true;
            }
        }
        return false;
    }

    // Seek to a specific percentage (0-100)
    seekToPercent(percent) {
        if (!this.video.duration) return;
        const targetTime = (percent / 100) * this.video.duration;
        this.seekToTime(targetTime);
    }

    // Time input methods
    showTimeInput() {
        this.timeDisplay.style.display = 'none';
        this.timeInputWrapper.style.display = 'flex';
        this.timeInput.value = '';
        this.timeInput.placeholder = this.formatTime(this.video.currentTime);
        this.timeInput.focus();
    }

    hideTimeInput() {
        this.timeInputWrapper.style.display = 'none';
        this.timeDisplay.style.display = '';
    }

    jumpToInputTime() {
        const input = this.timeInput.value.trim();
        if (!input) {
            this.hideTimeInput();
            return;
        }

        const seconds = this.parseTimeInput(input);
        if (seconds !== null && seconds >= 0 && seconds <= this.video.duration) {
            this.seekToTime(seconds);
            this.hideTimeInput();
        } else {
            // Invalid input - shake the input
            this.timeInput.style.animation = 'shake 0.3s ease';
            setTimeout(() => {
                this.timeInput.style.animation = '';
            }, 300);
        }
    }

    parseTimeInput(input) {
        // Support formats: "1:30", "1:30:00", "90", "1h30m", "90s"
        input = input.toLowerCase().trim();

        // Try HH:MM:SS or MM:SS format
        if (input.includes(':')) {
            const parts = input.split(':').map(p => parseInt(p) || 0);
            if (parts.length === 2) {
                // MM:SS
                return parts[0] * 60 + parts[1];
            } else if (parts.length === 3) {
                // HH:MM:SS
                return parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
        }

        // Try human readable format: 1h30m, 90s, 1h, 30m
        let totalSeconds = 0;
        const hourMatch = input.match(/(\d+)\s*h/);
        const minMatch = input.match(/(\d+)\s*m/);
        const secMatch = input.match(/(\d+)\s*s/);

        if (hourMatch || minMatch || secMatch) {
            if (hourMatch) totalSeconds += parseInt(hourMatch[1]) * 3600;
            if (minMatch) totalSeconds += parseInt(minMatch[1]) * 60;
            if (secMatch) totalSeconds += parseInt(secMatch[1]);
            return totalSeconds;
        }

        // Try plain number (seconds)
        const num = parseInt(input);
        if (!isNaN(num)) {
            return num;
        }

        return null;
    }

    updateTooltip(e) {
        const rect = this.progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const clampedPos = Math.max(0, Math.min(1, pos));
        const time = clampedPos * this.video.duration;

        this.progressTooltip.textContent = this.formatTime(time);
        this.progressTooltip.style.left = `${clampedPos * 100}%`;
    }

    updateProgress() {
        if (!this.video.duration) return;

        const progress = (this.video.currentTime / this.video.duration) * 100;
        this.progressPlayed.style.width = `${progress}%`;
        this.progressThumb.style.left = `${progress}%`;
        this.currentTimeEl.textContent = this.formatTime(this.video.currentTime);
    }

    updateBuffer() {
        if (!this.video.duration || this.video.buffered.length === 0) return;

        const duration = this.video.duration;
        const currentTime = this.video.currentTime;
        const now = Date.now();

        // Track max watched position for history buffer calculation
        if (currentTime > this.maxWatchedPosition) {
            this.maxWatchedPosition = currentTime;
        }

        // Collect all buffer ranges
        this.bufferRanges = [];
        for (let i = 0; i < this.video.buffered.length; i++) {
            this.bufferRanges.push({
                start: this.video.buffered.start(i),
                end: this.video.buffered.end(i)
            });
        }

        // Find buffer range containing current time
        let currentBufferEnd = currentTime;
        let currentBufferStart = currentTime;
        for (const range of this.bufferRanges) {
            if (currentTime >= range.start && currentTime <= range.end) {
                currentBufferEnd = range.end;
                currentBufferStart = range.start;
                break;
            }
        }

        // Calculate buffer ahead (from current position)
        const bufferAhead = currentBufferEnd - currentTime;

        // Calculate history buffer (from start of current buffer range)
        const historyBuffer = currentTime - currentBufferStart;

        // Calculate total buffered seconds
        let totalBuffered = 0;
        for (const range of this.bufferRanges) {
            totalBuffered += range.end - range.start;
        }

        // Update visual buffer bar - show the continuous buffer range around current position
        const bufferStartPercent = (currentBufferStart / duration) * 100;
        const bufferEndPercent = (currentBufferEnd / duration) * 100;

        this.progressBuffer.style.left = `${bufferStartPercent}%`;
        this.progressBuffer.style.width = `${bufferEndPercent - bufferStartPercent}%`;

        // Update stats display
        const aheadSeconds = Math.round(bufferAhead);
        this.bufferPercent.textContent = `${aheadSeconds}s ahead`;

        // Calculate real-time network speed using rolling average
        this.calculateNetworkSpeed(totalBuffered, now);
    }

    calculateNetworkSpeed(totalBuffered, now) {
        // Initialize on first call
        if (this.lastBufferTime === 0) {
            this.lastBufferTime = now;
            this.lastBufferedAmount = totalBuffered;
            return;
        }

        // Calculate speed based on buffer change over time
        const timeDelta = (now - this.lastBufferTime) / 1000; // seconds
        const bufferDelta = totalBuffered - this.lastBufferedAmount; // seconds of video

        if (timeDelta > 0.3) { // Update every 300ms minimum
            // Estimate bitrate: assume average video bitrate
            // For typical HD video: ~5 Mbps, 4K: ~15 Mbps, SD: ~2 Mbps
            const estimatedBitrate = 5000000; // 5 Mbps default assumption

            // bytes downloaded = seconds of video * (bitrate / 8)
            const bytesDownloaded = bufferDelta * (estimatedBitrate / 8);
            const speedBps = bytesDownloaded / timeDelta; // bytes per second

            if (bufferDelta > 0.1) {
                // Add to rolling average
                this.networkSpeedSamples.push(speedBps);
                if (this.networkSpeedSamples.length > this.maxSpeedSamples) {
                    this.networkSpeedSamples.shift();
                }

                // Calculate average speed
                const avgSpeed = this.networkSpeedSamples.reduce((a, b) => a + b, 0) / this.networkSpeedSamples.length;
                this.displayNetworkSpeed(avgSpeed);
            } else if (timeDelta > 2) {
                // No recent buffering activity
                const isFullyBuffered = totalBuffered >= this.video.duration - 1;
                if (isFullyBuffered) {
                    this.networkSpeed.textContent = 'Complete';
                    this.networkSpeed.style.color = 'var(--accent-primary)';
                } else {
                    this.networkSpeed.textContent = 'Waiting...';
                    this.networkSpeed.style.color = 'var(--text-tertiary)';
                }
            }

            // Update tracking
            this.lastBufferTime = now;
            this.lastBufferedAmount = totalBuffered;
        }
    }

    displayNetworkSpeed(bytesPerSecond) {
        this.networkSpeed.style.color = ''; // Reset to default color

        if (bytesPerSecond >= 1000000) {
            this.networkSpeed.textContent = `${(bytesPerSecond / 1000000).toFixed(1)} MB/s`;
        } else if (bytesPerSecond >= 1000) {
            this.networkSpeed.textContent = `${(bytesPerSecond / 1000).toFixed(0)} KB/s`;
        } else if (bytesPerSecond > 0) {
            this.networkSpeed.textContent = `${Math.round(bytesPerSecond)} B/s`;
        }
    }

    // Update speed status when not actively buffering
    updateSpeedStatus() {
        if (!this.video.duration) return;

        // Calculate total buffered
        let totalBuffered = 0;
        for (let i = 0; i < this.video.buffered.length; i++) {
            totalBuffered += this.video.buffered.end(i) - this.video.buffered.start(i);
        }

        const isFullyBuffered = totalBuffered >= this.video.duration - 1;
        const bufferPercent = Math.round((totalBuffered / this.video.duration) * 100);

        // Update based on current state
        if (isFullyBuffered) {
            this.networkSpeed.textContent = 'Complete';
            this.networkSpeed.style.color = 'var(--accent-primary)';
            this.bufferIndicator.classList.remove('active');
        } else if (this.networkSpeedSamples.length === 0) {
            // No speed data yet, show buffer progress
            this.networkSpeed.textContent = `${bufferPercent}% loaded`;
            this.networkSpeed.style.color = '';
        }
    }

    // Smart buffer management - continues buffering when paused
    startBufferManagement() {
        // Clear any existing interval
        if (this.bufferCheckInterval) {
            clearInterval(this.bufferCheckInterval);
        }

        // Check buffer status every 500ms
        this.bufferCheckInterval = setInterval(() => {
            this.manageBuffer();
        }, 500);
    }

    stopBufferManagement() {
        if (this.bufferCheckInterval) {
            clearInterval(this.bufferCheckInterval);
            this.bufferCheckInterval = null;
        }
    }

    manageBuffer() {
        if (!this.video.duration || !this.video.src) return;

        const currentTime = this.video.currentTime;
        const duration = this.video.duration;

        // Calculate required history buffer (10% of max watched position)
        const requiredHistoryBuffer = this.maxWatchedPosition * this.historyBufferRatio;

        // Find current buffer range
        let bufferAhead = 0;
        let bufferBehind = 0;
        let totalBuffered = 0;

        for (let i = 0; i < this.video.buffered.length; i++) {
            const start = this.video.buffered.start(i);
            const end = this.video.buffered.end(i);
            totalBuffered += end - start;

            if (currentTime >= start && currentTime <= end) {
                bufferAhead = end - currentTime;
                bufferBehind = currentTime - start;
            }
        }

        // Check if still buffering (not fully loaded)
        const isFullyBuffered = totalBuffered >= duration - 0.5;
        const needsMoreBuffer = bufferAhead < this.targetBufferAhead && !isFullyBuffered;

        // Show buffer indicator when paused and still buffering
        if (this.video.paused && needsMoreBuffer && !this.loadingOverlay.classList.contains('active')) {
            this.bufferIndicator.classList.add('active');
            this.encourageBuffering();
        } else {
            this.bufferIndicator.classList.remove('active');
        }

        // Update UI with buffer health indicator
        this.updateBufferHealth(bufferAhead, bufferBehind, requiredHistoryBuffer);

        // Update speed status display
        this.updateSpeedStatus();
    }

    encourageBuffering() {
        // Browsers automatically buffer when video is loaded
        // We ensure preload is set to auto for aggressive buffering
        if (this.video.preload !== 'auto') {
            this.video.preload = 'auto';
        }

        // Some browsers buffer more when we access buffered property
        // This is a hint to the browser that we care about buffering
        if (this.video.buffered.length > 0) {
            const lastBufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
            // Log buffer status for debugging
            console.debug(`Buffer: ${lastBufferedEnd.toFixed(1)}s / ${this.video.duration.toFixed(1)}s`);
        }
    }

    updateBufferHealth(ahead, behind, requiredHistory) {
        // Visual indicator of buffer health
        const bufferStat = document.getElementById('bufferStat');

        if (ahead >= 30) {
            bufferStat.classList.remove('warning', 'critical');
            bufferStat.classList.add('healthy');
        } else if (ahead >= 10) {
            bufferStat.classList.remove('healthy', 'critical');
            bufferStat.classList.add('warning');
        } else {
            bufferStat.classList.remove('healthy', 'warning');
            bufferStat.classList.add('critical');
        }
    }

    toggleMute() {
        if (this.video.muted) {
            this.video.muted = false;
            this.video.volume = this.lastVolume || 1;
        } else {
            this.lastVolume = this.video.volume;
            this.video.muted = true;
        }
    }

    setVolume(value) {
        this.video.volume = value;
        this.video.muted = value == 0;
        this.updateVolumeUI();
    }

    updateVolumeUI() {
        const volume = this.video.muted ? 0 : this.video.volume;
        const container = this.muteBtn.closest('.volume-container');

        this.volumeSlider.value = volume;
        this.volumeFill.style.width = `${volume * 100}%`;

        container.classList.remove('low', 'muted');
        if (volume === 0 || this.video.muted) {
            container.classList.add('muted');
        } else if (volume < 0.5) {
            container.classList.add('low');
        }
    }

    setPlaybackSpeed(speed) {
        try {
            this.video.playbackRate = speed;
            this.speedValue.textContent = `${speed}x`;

            document.querySelectorAll('.speed-option').forEach(option => {
                option.classList.toggle('active', parseFloat(option.dataset.speed) === speed);
            });

            this.speedMenu.classList.remove('active');
        } catch (error) {
            // Browser doesn't support this playback rate
            console.warn(`Playback rate ${speed}x not supported:`, error.message);
            this.showSpeedWarning(speed);
        }
    }

    showSpeedWarning(speed) {
        // Show temporary warning
        const warning = document.createElement('div');
        warning.className = 'speed-warning';
        warning.innerHTML = `⚠️ ${speed}x not supported. Browser limit: 0.0625x - 16x`;

        this.playerContainer.appendChild(warning);

        setTimeout(() => {
            warning.classList.add('fade-out');
            setTimeout(() => warning.remove(), 300);
        }, 2500);
    }

    toggleFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (this.playerContainer.requestFullscreen) {
                this.playerContainer.requestFullscreen();
            } else if (this.playerContainer.webkitRequestFullscreen) {
                this.playerContainer.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }

    onFullscreenChange() {
        this.isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
        this.playerContainer.classList.toggle('fullscreen', this.isFullscreen);
    }

    async togglePiP() {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (document.pictureInPictureEnabled) {
                await this.video.requestPictureInPicture();
            }
        } catch (e) {
            console.error('PiP error:', e);
        }
    }

    showControls() {
        clearTimeout(this.controlsTimeout);
        clearTimeout(this.cursorTimeout);

        this.playerContainer.classList.add('show-controls');
        this.playerContainer.classList.remove('hide-cursor');

        if (this.isPlaying) {
            this.controlsTimeout = setTimeout(() => {
                this.playerContainer.classList.remove('show-controls');
            }, 1000);

            if (this.isFullscreen) {
                this.cursorTimeout = setTimeout(() => {
                    this.playerContainer.classList.add('hide-cursor');
                }, 1000);
            }
        }
    }

    hideControls() {
        if (this.isPlaying) {
            this.playerContainer.classList.remove('show-controls');
        }
    }

    handleKeyboard(e) {
        // Don't handle if typing in input
        if (e.target.tagName === 'INPUT') return;
        // Don't handle if locked (except 'l' to unlock)
        const key = e.key.toLowerCase();
        if (this.isLocked && key !== 'l') return;

        switch (key) {
            case ' ':
            case 'k':
                e.preventDefault();
                if (this.playerSection.classList.contains('active')) {
                    this.togglePlay();
                }
                break;
            case 'f':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 'm':
                e.preventDefault();
                this.toggleMute();
                break;
            case 'p':
                e.preventDefault();
                this.togglePiP();
                break;
            case 'l':
                e.preventDefault();
                this.toggleLock();
                break;
            case 'arrowleft':
            case 'j':
                e.preventDefault();
                this.skip(-this.seekDuration);
                break;
            case 'arrowright':
                e.preventDefault();
                this.skip(this.seekDuration);
                break;
            case 'arrowup':
                e.preventDefault();
                this.setVolume(Math.min(1, this.video.volume + 0.1));
                break;
            case 'arrowdown':
                e.preventDefault();
                this.setVolume(Math.max(0, this.video.volume - 0.1));
                break;
            case '?':
                e.preventDefault();
                this.shortcutsModal.classList.toggle('active');
                break;
            case 'escape':
                this.shortcutsModal.classList.remove('active');
                break;
            default:
                // Number keys for seeking (0-9 = 0%-90%)
                if (key >= '0' && key <= '9') {
                    e.preventDefault();
                    const percent = parseInt(key) * 10;
                    this.seekToPercent(percent);
                }
        }
    }

    showLoading() {
        this.loadingOverlay.classList.add('active');
    }

    hideLoading() {
        this.loadingOverlay.classList.remove('active');
    }

    showError(message = 'Unable to load video') {
        this.hideLoading();
        this.errorText.textContent = message;
        this.errorOverlay.classList.add('active');
    }

    hideError() {
        this.errorOverlay.classList.remove('active');
    }

    handleError(e) {
        const error = this.video.error;
        let message = 'Unable to load video';

        if (error) {
            switch (error.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                    message = 'Video playback aborted';
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    message = 'Network error - check your connection or the URL may have expired';
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    message = 'Video format not supported by browser';
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    // Try without crossorigin attribute if it was set
                    if (this.video.hasAttribute('crossorigin') && !this.triedWithoutCors) {
                        this.triedWithoutCors = true;
                        console.log('Retrying without CORS...');
                        this.video.removeAttribute('crossorigin');
                        this.video.load();
                        return;
                    }
                    // Try with crossorigin if it wasn't set
                    if (!this.video.hasAttribute('crossorigin') && !this.triedWithCors) {
                        this.triedWithCors = true;
                        console.log('Retrying with CORS anonymous...');
                        this.video.setAttribute('crossorigin', 'anonymous');
                        this.video.load();
                        return;
                    }

                    // Check if it's a Google URL for specific message
                    const isGoogleUrl = this.currentUrl.includes('googleusercontent.com') ||
                        this.currentUrl.includes('googlevideo.com');
                    if (isGoogleUrl) {
                        message = 'Google video URL has expired!\n\nGoogle download links are only valid for a few hours.\nPlease get a fresh download URL.';
                    } else {
                        message = 'Video cannot be played.\n\n• URL may be expired or invalid\n• Server may block external access\n• Format may not be supported';
                    }
                    break;
            }
        }

        this.showError(message);
    }

    showPlayerSection() {
        this.urlSection.classList.add('hidden');
        this.playerSection.classList.add('active');
    }

    showUrlSection() {
        this.urlSection.classList.remove('hidden');
        this.playerSection.classList.remove('active');

        // Stop buffer management
        this.stopBufferManagement();

        // Reset video
        this.video.pause();
        this.video.src = '';
        this.video.load();

        // Reset buffer tracking
        this.maxWatchedPosition = 0;
        this.bufferRanges = [];
        this.lastBufferTime = 0;
        this.lastBufferedAmount = 0;
        this.networkSpeedSamples = [];

        // Reset UI
        this.hideLoading();
        this.hideError();
        this.progressPlayed.style.width = '0%';
        this.progressBuffer.style.width = '0%';
        this.progressBuffer.style.left = '0%';
        this.progressThumb.style.left = '0%';
        this.currentTimeEl.textContent = '0:00';
        this.durationEl.textContent = '0:00';
        this.bufferPercent.textContent = '0%';
        this.networkSpeed.textContent = '—';

        // Remove buffer health classes
        const bufferStat = document.getElementById('bufferStat');
        bufferStat.classList.remove('healthy', 'warning', 'critical');

        // Hide buffer indicator
        this.bufferIndicator.classList.remove('active');

        // Clear URL params
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('url');
        window.history.replaceState({}, '', newUrl);

        this.urlInput.focus();

        // Unlock if locked
        if (this.isLocked) this.toggleLock();

        // Reset tracks UI
        this.audioTrackOptions.innerHTML = '<div class="settings-empty">No extra audio tracks</div>';
        this.subtitleOptions.innerHTML = '<div class="settings-empty">No subtitles detected</div>';
    }

    // ===========================
    //  LOCK / UNLOCK
    // ===========================

    toggleLock() {
        this.isLocked = !this.isLocked;
        this.playerContainer.classList.toggle('player-locked', this.isLocked);
        this.lockOverlay.classList.toggle('active', this.isLocked);

        if (this.isLocked) {
            // Hide controls immediately
            this.playerContainer.classList.remove('show-controls');
            clearTimeout(this.controlsTimeout);
        }
    }

    // ===========================
    //  SEEK DURATION
    // ===========================

    applySeekDuration(dur) {
        this.seekDuration = dur;
        localStorage.setItem('seekDuration', dur);

        // Update UI buttons
        this.seekDurationOptions.querySelectorAll('.seek-duration-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.seek) === dur);
        });

        // Update skip button titles and SVG text
        if (this.skipBackBtn) {
            this.skipBackBtn.title = `Back ${dur}s (←)`;
            const txt = this.skipBackBtn.querySelector('text');
            if (txt) txt.textContent = dur;
        }
        if (this.skipForwardBtn) {
            this.skipForwardBtn.title = `Forward ${dur}s (→)`;
            const txt = this.skipForwardBtn.querySelector('text');
            if (txt) txt.textContent = dur;
        }
    }

    // ===========================
    //  TRACK DETECTION
    // ===========================

    detectTracks() {
        // Try HLS.js tracks first
        if (this.hlsInstance) {
            this.populateHLSTracks();
            return;
        }

        // Native audio tracks (Safari mainly)
        this.populateAudioTracks();
        // Native text tracks (subtitles/captions)
        this.populateSubtitles();
    }

    populateHLSTracks() {
        const hls = this.hlsInstance;

        // Audio tracks from HLS
        if (hls.audioTracks && hls.audioTracks.length > 1) {
            this.audioTrackOptions.innerHTML = '';
            hls.audioTracks.forEach((track, i) => {
                const btn = document.createElement('button');
                btn.className = 'settings-option-btn' + (i === hls.audioTrack ? ' active' : '');
                btn.textContent = track.name || track.lang || `Track ${i + 1}`;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hls.audioTrack = i;
                    this.audioTrackOptions.querySelectorAll('.settings-option-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
                this.audioTrackOptions.appendChild(btn);
            });
        }

        // Subtitle tracks from HLS
        if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
            this.subtitleOptions.innerHTML = '';
            // Off option
            const offBtn = document.createElement('button');
            offBtn.className = 'settings-option-btn active';
            offBtn.textContent = 'Off';
            offBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                hls.subtitleTrack = -1;
                this.subtitleOptions.querySelectorAll('.settings-option-btn').forEach(b => b.classList.remove('active'));
                offBtn.classList.add('active');
            });
            this.subtitleOptions.appendChild(offBtn);

            hls.subtitleTracks.forEach((track, i) => {
                const btn = document.createElement('button');
                btn.className = 'settings-option-btn';
                btn.textContent = track.name || track.lang || `Subtitle ${i + 1}`;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hls.subtitleTrack = i;
                    hls.subtitleDisplay = true;
                    this.subtitleOptions.querySelectorAll('.settings-option-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
                this.subtitleOptions.appendChild(btn);
            });
        }
    }

    populateAudioTracks() {
        const tracks = this.video.audioTracks;

        // audioTracks API is not supported in Chrome/Firefox (Safari/Edge only)
        if (!tracks) {
            this.audioTrackOptions.innerHTML = '<div class="settings-empty">Audio track switching requires HLS streams or Safari browser</div>';
            return;
        }

        if (tracks.length <= 1) {
            this.audioTrackOptions.innerHTML = '<div class="settings-empty">Single audio track</div>';
            return;
        }

        this.audioTrackOptions.innerHTML = '';
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            const btn = document.createElement('button');
            btn.className = 'settings-option-btn' + (track.enabled ? ' active' : '');
            btn.textContent = track.label || track.language || `Track ${i + 1}`;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Disable all, enable selected
                for (let j = 0; j < tracks.length; j++) {
                    tracks[j].enabled = (j === i);
                }
                this.audioTrackOptions.querySelectorAll('.settings-option-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            this.audioTrackOptions.appendChild(btn);
        }
    }

    populateSubtitles() {
        const tracks = this.video.textTracks;
        if (!tracks || tracks.length === 0) return;

        this.subtitleOptions.innerHTML = '';

        // Off option
        const offBtn = document.createElement('button');
        offBtn.className = 'settings-option-btn active';
        offBtn.textContent = 'Off';
        offBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            for (let i = 0; i < tracks.length; i++) {
                tracks[i].mode = 'disabled';
            }
            this.subtitleOptions.querySelectorAll('.settings-option-btn').forEach(b => b.classList.remove('active'));
            offBtn.classList.add('active');
        });
        this.subtitleOptions.appendChild(offBtn);

        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            if (track.kind === 'subtitles' || track.kind === 'captions') {
                const btn = document.createElement('button');
                btn.className = 'settings-option-btn' + (track.mode === 'showing' ? ' active' : '');
                btn.textContent = track.label || track.language || `Subtitle ${i + 1}`;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    for (let j = 0; j < tracks.length; j++) {
                        tracks[j].mode = 'disabled';
                    }
                    track.mode = 'showing';
                    this.subtitleOptions.querySelectorAll('.settings-option-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
                this.subtitleOptions.appendChild(btn);
            }
        }

        // If only "Off" button exists, show no subtitles message
        if (this.subtitleOptions.children.length <= 1) {
            this.subtitleOptions.innerHTML = '<div class="settings-empty">No subtitles detected</div>';
        }
    }

    // ===========================
    //  EXTERNAL SUBTITLE LOADING
    // ===========================

    loadSubtitleFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            let content = e.target.result;
            const name = file.name.replace(/\.[^.]+$/, '');

            // Convert SRT to VTT if needed
            if (file.name.endsWith('.srt')) {
                content = this.srtToVtt(content);
            } else if (file.name.endsWith('.ass') || file.name.endsWith('.ssa')) {
                content = this.assToVtt(content);
            }

            this.addSubtitleTrack(content, name);
        };
        reader.readAsText(file);
    }

    async loadSubtitleFromUrl(url) {
        if (!url) return;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            let content = await response.text();
            const name = url.split('/').pop().replace(/\.[^.]+$/, '') || 'External';

            if (url.endsWith('.srt')) {
                content = this.srtToVtt(content);
            } else if (url.endsWith('.ass') || url.endsWith('.ssa')) {
                content = this.assToVtt(content);
            }

            this.addSubtitleTrack(content, name);
        } catch (err) {
            console.error('Failed to load subtitle URL:', err);
        }
    }

    srtToVtt(srt) {
        // Convert SRT format to WebVTT
        let vtt = 'WEBVTT\n\n';
        // Normalize line endings
        srt = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        // Replace SRT timestamp format (comma) with VTT format (dot)
        vtt += srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        return vtt;
    }

    assToVtt(ass) {
        // Basic ASS/SSA to VTT conversion
        let vtt = 'WEBVTT\n\n';
        const lines = ass.split(/\r?\n/);
        let inEvents = false;
        let formatFields = [];

        for (const line of lines) {
            if (line.trim().startsWith('[Events]')) {
                inEvents = true;
                continue;
            }
            if (line.trim().startsWith('[') && inEvents) break;

            if (inEvents && line.startsWith('Format:')) {
                formatFields = line.replace('Format:', '').split(',').map(f => f.trim().toLowerCase());
                continue;
            }

            if (inEvents && line.startsWith('Dialogue:')) {
                const values = line.replace('Dialogue:', '').split(',');
                const startIdx = formatFields.indexOf('start');
                const endIdx = formatFields.indexOf('end');
                const textIdx = formatFields.indexOf('text');

                if (startIdx >= 0 && endIdx >= 0 && textIdx >= 0) {
                    const start = values[startIdx]?.trim();
                    const end = values[endIdx]?.trim();
                    // Text may contain commas, so join remaining
                    const text = values.slice(textIdx).join(',').trim()
                        .replace(/\\N/g, '\n')
                        .replace(/\\n/g, '\n')
                        .replace(/\{[^}]*\}/g, ''); // strip ASS style tags

                    if (start && end && text) {
                        // ASS uses H:MM:SS.cc, VTT uses HH:MM:SS.mmm
                        const fmtTime = (t) => {
                            const parts = t.split(':');
                            if (parts.length === 3) {
                                const h = parts[0].padStart(2, '0');
                                const m = parts[1].padStart(2, '0');
                                const sDot = parts[2].split('.');
                                const s = sDot[0].padStart(2, '0');
                                const ms = (sDot[1] || '0').padEnd(3, '0').slice(0, 3);
                                return `${h}:${m}:${s}.${ms}`;
                            }
                            return t;
                        };
                        vtt += `${fmtTime(start)} --> ${fmtTime(end)}\n${text}\n\n`;
                    }
                }
            }
        }
        return vtt;
    }

    addSubtitleTrack(vttContent, label) {
        // Create a blob URL for the VTT content
        const blob = new Blob([vttContent], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);

        // Remove any existing track elements we previously added
        const existingTracks = this.video.querySelectorAll('track[data-external]');
        existingTracks.forEach(t => t.remove());

        // Add new track element
        const trackEl = document.createElement('track');
        trackEl.kind = 'subtitles';
        trackEl.label = label || 'External';
        trackEl.srclang = 'en';
        trackEl.src = url;
        trackEl.default = true;
        trackEl.setAttribute('data-external', 'true');
        this.video.appendChild(trackEl);

        // Enable the new track after a tick (browser needs to parse it)
        setTimeout(() => {
            const tracks = this.video.textTracks;
            // Disable all other tracks
            for (let i = 0; i < tracks.length; i++) {
                tracks[i].mode = 'disabled';
            }
            // Enable the last one (our new track)
            if (tracks.length > 0) {
                tracks[tracks.length - 1].mode = 'showing';
            }
            // Refresh the subtitle picker UI
            this.populateSubtitles();
        }, 100);

        console.log(`📝 Loaded external subtitle: ${label}`);
    }

    formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds)) return '0:00';

        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);

        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}

// Initialize player when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.streamFlow = new StreamFlowPlayer();
    window.movieLibrary = new MovieLibrary(window.streamFlow);
});

// Service Worker for offline support (optional enhancement)
if ('serviceWorker' in navigator) {
    // Uncomment to enable service worker
    // navigator.serviceWorker.register('/sw.js');
}

/**
 * Movie Library Manager
 * Handles search from Supabase database and adding new movies
 */
class MovieLibrary {
    constructor(player) {
        this.player = player;

        // API base path
        this.apiBase = window.location.hostname === 'localhost'
            ? 'http://localhost:4000/api'
            : '/api';

        // Search elements
        this.searchInput = document.getElementById('movieSearch');
        this.searchResults = document.getElementById('searchResults');
        this.searchSpinner = document.getElementById('searchSpinner');
        this.searchWrapper = document.getElementById('searchWrapper');

        // Add Movie Modal elements
        this.addMovieBtn = document.getElementById('addMovieBtn');
        this.addMovieModal = document.getElementById('addMovieModal');
        this.closeAddMovie = document.getElementById('closeAddMovie');
        this.addMovieForm = document.getElementById('addMovieForm');
        this.movieTitleInput = document.getElementById('movieTitle');
        this.movieLinkInput = document.getElementById('movieLink');
        this.formStatus = document.getElementById('formStatus');
        this.submitMovieBtn = document.getElementById('submitMovieBtn');

        // Toast container
        this.toastContainer = document.getElementById('toastContainer');

        // Search state
        this.searchTimeout = null;
        this.searchAbortController = null;
        this.lastQuery = '';

        this.init();
    }

    init() {
        this.bindSearchEvents();
        this.bindModalEvents();
    }

    // ===========================
    //  SEARCH FUNCTIONALITY
    // ===========================

    bindSearchEvents() {
        // Live search with debounce
        this.searchInput.addEventListener('input', () => {
            this.debounceSearch();
        });

        // Show results on focus if there's text
        this.searchInput.addEventListener('focus', () => {
            const query = this.searchInput.value.trim();
            if (query.length >= 2) {
                this.debounceSearch();
            }
        });

        // Close results when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.searchWrapper.contains(e.target)) {
                this.hideSearchResults();
            }
        });

        // Keyboard navigation for search results
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideSearchResults();
                this.searchInput.blur();
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.focusNextResult(1);
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.focusNextResult(-1);
            }
            if (e.key === 'Enter') {
                const focused = this.searchResults.querySelector('.search-result-item.focused');
                if (focused) {
                    e.preventDefault();
                    focused.click();
                }
            }
        });
    }

    debounceSearch() {
        clearTimeout(this.searchTimeout);
        const query = this.searchInput.value.trim();

        if (query.length < 2) {
            this.hideSearchResults();
            return;
        }

        this.searchTimeout = setTimeout(() => {
            this.performSearch(query);
        }, 300);
    }

    async performSearch(query) {
        if (query === this.lastQuery) return;
        this.lastQuery = query;

        // Abort previous request
        if (this.searchAbortController) {
            this.searchAbortController.abort();
        }
        this.searchAbortController = new AbortController();

        this.showSearchSpinner();

        try {
            const response = await fetch(
                `${this.apiBase}/movies?search=${encodeURIComponent(query)}&limit=15`,
                { signal: this.searchAbortController.signal }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            if (data.success && data.movies) {
                this.renderSearchResults(data.movies, query);
            } else {
                this.renderSearchError('Failed to search movies');
            }
        } catch (error) {
            if (error.name === 'AbortError') return; // Ignore aborted requests
            console.error('Search error:', error);
            this.renderSearchError('Search failed. Please try again.');
        } finally {
            this.hideSearchSpinner();
        }
    }

    renderSearchResults(movies, query) {
        this.searchResults.innerHTML = '';

        if (movies.length === 0) {
            this.searchResults.innerHTML = `
                <div class="search-empty">
                    No movies found matching "<strong>${this.escapeHtml(query)}</strong>"
                    <span class="search-hint">Try a different title or add it to the library</span>
                </div>
            `;
            this.showSearchResults();
            return;
        }

        movies.forEach(movie => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.dataset.link = movie.link;
            item.dataset.title = movie.title;

            // Highlight matching text
            const highlightedTitle = this.highlightMatch(movie.title, query);

            // Truncate link for display
            const displayLink = this.truncateUrl(movie.link, 50);

            item.innerHTML = `
                <div class="result-icon">
                    <svg viewBox="0 0 24 24" fill="none">
                        <rect x="2" y="3" width="20" height="18" rx="3" stroke="currentColor" stroke-width="2"/>
                        <path d="M10 14l4-2.5L10 9v5z" fill="currentColor"/>
                    </svg>
                </div>
                <div class="result-info">
                    <div class="result-title">${highlightedTitle}</div>
                    <div class="result-link">${this.escapeHtml(displayLink)}</div>
                </div>
                <div class="result-play-icon">
                    <svg viewBox="0 0 24 24" fill="none">
                        <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86a1 1 0 00-1.5.86z" fill="currentColor"/>
                    </svg>
                </div>
            `;

            // Click to play
            item.addEventListener('click', () => {
                this.selectMovie(movie);
            });

            this.searchResults.appendChild(item);
        });

        this.showSearchResults();
    }

    selectMovie(movie) {
        // Set the URL in the player input and start playing
        this.player.urlInput.value = movie.link;
        this.hideSearchResults();
        this.searchInput.value = '';
        this.lastQuery = '';

        // Show toast
        this.showToast('success', `Now playing: ${movie.title}`);

        // Load the video
        this.player.loadVideo();
    }

    highlightMatch(text, query) {
        const escaped = this.escapeHtml(text);
        const queryEscaped = this.escapeHtml(query);

        // Case-insensitive highlight
        const regex = new RegExp(`(${queryEscaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return escaped.replace(regex, '<mark>$1</mark>');
    }

    truncateUrl(url, maxLen) {
        if (url.length <= maxLen) return url;
        return url.substring(0, maxLen - 3) + '...';
    }

    showSearchResults() {
        this.searchResults.classList.add('active');
    }

    hideSearchResults() {
        this.searchResults.classList.remove('active');
    }

    showSearchSpinner() {
        this.searchSpinner.classList.add('active');
    }

    hideSearchSpinner() {
        this.searchSpinner.classList.remove('active');
    }

    focusNextResult(direction) {
        const items = Array.from(this.searchResults.querySelectorAll('.search-result-item'));
        if (items.length === 0) return;

        const currentIndex = items.findIndex(item => item.classList.contains('focused'));

        // Remove current focus
        items.forEach(item => item.classList.remove('focused'));

        let nextIndex;
        if (currentIndex === -1) {
            nextIndex = direction > 0 ? 0 : items.length - 1;
        } else {
            nextIndex = currentIndex + direction;
            if (nextIndex < 0) nextIndex = items.length - 1;
            if (nextIndex >= items.length) nextIndex = 0;
        }

        items[nextIndex].classList.add('focused');
        items[nextIndex].scrollIntoView({ block: 'nearest' });
    }

    renderSearchError(message) {
        this.searchResults.innerHTML = `
            <div class="search-error">
                ${this.escapeHtml(message)}
            </div>
        `;
        this.showSearchResults();
    }

    // ===========================
    //  ADD MOVIE MODAL
    // ===========================

    bindModalEvents() {
        // Open modal
        this.addMovieBtn.addEventListener('click', () => {
            this.openModal();
        });

        // Close modal
        this.closeAddMovie.addEventListener('click', () => {
            this.closeModal();
        });

        // Close on overlay click
        this.addMovieModal.addEventListener('click', (e) => {
            if (e.target === this.addMovieModal) {
                this.closeModal();
            }
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.addMovieModal.classList.contains('active')) {
                this.closeModal();
            }
        });

        // Form submission
        this.addMovieForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddMovie();
        });
    }

    openModal() {
        this.addMovieModal.classList.add('active');
        this.movieTitleInput.focus();
        this.clearFormStatus();
    }

    closeModal() {
        this.addMovieModal.classList.remove('active');
        this.addMovieForm.reset();
        this.clearFormStatus();
    }

    async handleAddMovie() {
        const title = this.movieTitleInput.value.trim();
        const link = this.movieLinkInput.value.trim();

        if (!title || !link) {
            this.setFormStatus('Please fill in both fields', 'error');
            return;
        }

        // Validate URL
        try {
            new URL(link);
        } catch {
            this.setFormStatus('Please enter a valid URL', 'error');
            return;
        }

        // Disable submit
        this.submitMovieBtn.disabled = true;
        this.setFormStatus('Adding movie...', 'loading');

        try {
            const response = await fetch(`${this.apiBase}/movies`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, link })
            });

            const data = await response.json();

            if (data.success) {
                this.setFormStatus('✓ Movie added successfully!', 'success');
                this.showToast('success', `Added "${title}" to library`);

                // Reset form after a brief moment
                setTimeout(() => {
                    this.addMovieForm.reset();
                    this.clearFormStatus();
                    this.closeModal();
                }, 1200);
            } else {
                this.setFormStatus(data.error || 'Failed to add movie', 'error');
                this.showToast('error', data.error || 'Failed to add movie');
            }
        } catch (error) {
            console.error('Add movie error:', error);
            this.setFormStatus('Network error. Please try again.', 'error');
            this.showToast('error', 'Network error');
        } finally {
            this.submitMovieBtn.disabled = false;
        }
    }

    setFormStatus(message, type) {
        this.formStatus.textContent = message;
        this.formStatus.className = `form-status ${type}`;
    }

    clearFormStatus() {
        this.formStatus.textContent = '';
        this.formStatus.className = 'form-status';
    }

    // ===========================
    //  TOAST NOTIFICATIONS
    // ===========================

    showToast(type, message, duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icon = type === 'success' ? '✓' : '✕';

        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span>${this.escapeHtml(message)}</span>
        `;

        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ===========================
    //  UTILITIES
    // ===========================

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
