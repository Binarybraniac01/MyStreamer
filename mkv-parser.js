/**
 * Lightweight MKV (Matroska/EBML) Header Parser
 * Extracts track information (audio, subtitle) from MKV files
 * Works by fetching the file header via HTTP Range requests
 */

class MKVParser {
    // EBML Element IDs we care about
    static EBML_IDS = {
        EBML: 0x1A45DFA3,
        Segment: 0x18538067,
        // Segment info
        Tracks: 0x1654AE6B,
        TrackEntry: 0xAE,
        TrackNumber: 0xD7,
        TrackType: 0x83,
        TrackLanguage: 0x22B59C,
        TrackName: 0x536E,
        CodecID: 0x86,
        CodecPrivate: 0x63A2,
        DefaultDuration: 0x23E383,
        FlagDefault: 0x88,
        FlagForced: 0x55AA,
        // Audio
        Audio: 0xE1,
        SamplingFrequency: 0xB5,
        Channels: 0x9F,
        BitDepth: 0x6264,
        // Content encoding
        ContentEncodings: 0x6D80,
    };

    // TrackType values
    static TRACK_TYPES = {
        1: 'video',
        2: 'audio',
        17: 'subtitle',
    };

    constructor() {
        this.tracks = [];
        this.buffer = null;
        this.view = null;
        this.offset = 0;
    }

    /**
     * Parse MKV tracks from a URL
     * @param {string} url - URL of the MKV file
     * @returns {Promise<{tracks: Array}>} Parsed track information
     */
    async parse(url) {
        try {
            // Fetch the first 1MB of the file (tracks info is usually in first few hundred KB)
            const headerSize = 1024 * 1024; // 1MB
            const response = await fetch(url, {
                headers: { 'Range': `bytes=0-${headerSize - 1}` },
                mode: 'cors',
            });

            if (!response.ok && response.status !== 206) {
                // Try without range
                const fullResponse = await fetch(url, { mode: 'cors' });
                if (!fullResponse.ok) throw new Error(`HTTP ${fullResponse.status}`);
                const fullBuffer = await fullResponse.arrayBuffer();
                this.buffer = new Uint8Array(fullBuffer.slice(0, headerSize));
            } else {
                const arrayBuffer = await response.arrayBuffer();
                this.buffer = new Uint8Array(arrayBuffer);
            }

            this.view = new DataView(this.buffer.buffer);
            this.offset = 0;
            this.tracks = [];

            // Verify EBML header
            if (!this.verifyEBML()) {
                console.warn('MKV Parser: Not a valid EBML/MKV file');
                return { tracks: [] };
            }

            // Find and parse Tracks element
            this.findAndParseTracks();

            console.log(`MKV Parser: Found ${this.tracks.length} tracks`, this.tracks);
            return { tracks: this.tracks };
        } catch (error) {
            console.warn('MKV Parser: Could not parse file -', error.message);
            return { tracks: [] };
        }
    }

    verifyEBML() {
        if (this.buffer.length < 4) return false;
        // EBML header starts with 0x1A 0x45 0xDF 0xA3
        return (
            this.buffer[0] === 0x1A &&
            this.buffer[1] === 0x45 &&
            this.buffer[2] === 0xDF &&
            this.buffer[3] === 0xA3
        );
    }

    findAndParseTracks() {
        this.offset = 0;

        // Skip EBML header element
        const ebmlId = this.readElementId();
        if (ebmlId !== MKVParser.EBML_IDS.EBML) return;
        const ebmlSize = this.readVINT();
        this.offset += ebmlSize; // Skip EBML header content

        // Now we should be at the Segment element
        if (this.offset >= this.buffer.length) return;

        const segmentId = this.readElementId();
        if (segmentId !== MKVParser.EBML_IDS.Segment) return;
        this.readVINT(); // Segment size (usually very large / unknown)

        // Scan for Tracks element within Segment
        const segmentDataStart = this.offset;
        const scanLimit = Math.min(this.buffer.length, segmentDataStart + 900000); // Scan first 900KB of segment

        while (this.offset < scanLimit - 4) {
            const elementStart = this.offset;

            try {
                const id = this.readElementId();
                const size = this.readVINT();

                if (id === MKVParser.EBML_IDS.Tracks) {
                    // Found Tracks! Parse track entries
                    this.parseTracksElement(this.offset, size);
                    return; // Done
                }

                // Skip this element's data
                if (size > 0 && size < 100000000) { // Sanity check
                    this.offset += size;
                } else {
                    // Unknown size or too large, try next byte
                    this.offset = elementStart + 1;
                }
            } catch (e) {
                // Parse error, advance and try again
                this.offset = elementStart + 1;
            }
        }
    }

    parseTracksElement(start, size) {
        const end = Math.min(start + size, this.buffer.length);
        this.offset = start;

        while (this.offset < end - 2) {
            try {
                const id = this.readElementId();
                const elemSize = this.readVINT();

                if (id === MKVParser.EBML_IDS.TrackEntry) {
                    const track = this.parseTrackEntry(this.offset, elemSize);
                    if (track) {
                        this.tracks.push(track);
                    }
                    this.offset += elemSize;
                } else {
                    // Skip non-TrackEntry elements
                    if (elemSize > 0 && elemSize < 10000000) {
                        this.offset += elemSize;
                    } else {
                        break;
                    }
                }
            } catch (e) {
                break;
            }
        }
    }

    parseTrackEntry(start, size) {
        const end = Math.min(start + size, this.buffer.length);
        let pos = start;

        const track = {
            number: 0,
            type: 'unknown',
            typeId: 0,
            language: 'und',
            name: '',
            codecId: '',
            isDefault: false,
            channels: 0,
            sampleRate: 0,
        };

        while (pos < end - 2) {
            const savedOffset = this.offset;
            this.offset = pos;

            try {
                const id = this.readElementId();
                const elemSize = this.readVINT();
                const dataStart = this.offset;

                switch (id) {
                    case MKVParser.EBML_IDS.TrackNumber:
                        track.number = this.readUInt(dataStart, elemSize);
                        break;
                    case MKVParser.EBML_IDS.TrackType:
                        track.typeId = this.readUInt(dataStart, elemSize);
                        track.type = MKVParser.TRACK_TYPES[track.typeId] || 'unknown';
                        break;
                    case MKVParser.EBML_IDS.TrackLanguage:
                        track.language = this.readString(dataStart, elemSize);
                        break;
                    case MKVParser.EBML_IDS.TrackName:
                        track.name = this.readUTF8(dataStart, elemSize);
                        break;
                    case MKVParser.EBML_IDS.CodecID:
                        track.codecId = this.readString(dataStart, elemSize);
                        break;
                    case MKVParser.EBML_IDS.FlagDefault:
                        track.isDefault = this.readUInt(dataStart, elemSize) === 1;
                        break;
                    case MKVParser.EBML_IDS.Audio:
                        // Parse audio sub-element
                        this.parseAudioElement(dataStart, elemSize, track);
                        break;
                }

                pos = dataStart + elemSize;
            } catch (e) {
                pos++;
            }

            this.offset = savedOffset;
        }

        // Only return audio and subtitle tracks
        if (track.type === 'audio' || track.type === 'subtitle') {
            return track;
        }
        return null;
    }

    parseAudioElement(start, size, track) {
        const end = Math.min(start + size, this.buffer.length);
        let pos = start;

        while (pos < end - 2) {
            const savedOffset = this.offset;
            this.offset = pos;

            try {
                const id = this.readElementId();
                const elemSize = this.readVINT();
                const dataStart = this.offset;

                switch (id) {
                    case MKVParser.EBML_IDS.Channels:
                        track.channels = this.readUInt(dataStart, elemSize);
                        break;
                    case MKVParser.EBML_IDS.SamplingFrequency:
                        track.sampleRate = this.readFloat(dataStart, elemSize);
                        break;
                }

                pos = dataStart + elemSize;
            } catch (e) {
                pos++;
            }

            this.offset = savedOffset;
        }
    }

    // ===========================
    //  EBML PRIMITIVES
    // ===========================

    readElementId() {
        if (this.offset >= this.buffer.length) throw new Error('EOF');

        const first = this.buffer[this.offset];
        let len;

        if (first & 0x80) len = 1;
        else if (first & 0x40) len = 2;
        else if (first & 0x20) len = 3;
        else if (first & 0x10) len = 4;
        else throw new Error('Invalid EBML ID');

        let id = 0;
        for (let i = 0; i < len; i++) {
            if (this.offset + i >= this.buffer.length) throw new Error('EOF');
            id = (id << 8) | this.buffer[this.offset + i];
        }
        this.offset += len;
        return id;
    }

    readVINT() {
        if (this.offset >= this.buffer.length) throw new Error('EOF');

        const first = this.buffer[this.offset];
        let len;
        let mask;

        if (first & 0x80) { len = 1; mask = 0x7F; }
        else if (first & 0x40) { len = 2; mask = 0x3F; }
        else if (first & 0x20) { len = 3; mask = 0x1F; }
        else if (first & 0x10) { len = 4; mask = 0x0F; }
        else if (first & 0x08) { len = 5; mask = 0x07; }
        else if (first & 0x04) { len = 6; mask = 0x03; }
        else if (first & 0x02) { len = 7; mask = 0x01; }
        else if (first & 0x01) { len = 8; mask = 0x00; }
        else throw new Error('Invalid VINT');

        let value = first & mask;
        for (let i = 1; i < len; i++) {
            if (this.offset + i >= this.buffer.length) throw new Error('EOF');
            value = (value * 256) + this.buffer[this.offset + i];
        }

        // Check for unknown size (all data bits set to 1)
        const allOnes = (mask * Math.pow(256, len - 1)) + (Math.pow(256, len - 1) - 1);
        if (value === allOnes) {
            value = -1; // Unknown size
        }

        this.offset += len;
        return value;
    }

    readUInt(start, length) {
        let val = 0;
        for (let i = 0; i < length && start + i < this.buffer.length; i++) {
            val = (val * 256) + this.buffer[start + i];
        }
        return val;
    }

    readFloat(start, length) {
        if (length === 4 && start + 4 <= this.buffer.length) {
            return this.view.getFloat32(start);
        } else if (length === 8 && start + 8 <= this.buffer.length) {
            return this.view.getFloat64(start);
        }
        return 0;
    }

    readString(start, length) {
        let str = '';
        for (let i = 0; i < length && start + i < this.buffer.length; i++) {
            const c = this.buffer[start + i];
            if (c === 0) break; // Null terminator
            str += String.fromCharCode(c);
        }
        return str;
    }

    readUTF8(start, length) {
        const bytes = this.buffer.slice(start, Math.min(start + length, this.buffer.length));
        try {
            return new TextDecoder('utf-8').decode(bytes).replace(/\0/g, '');
        } catch {
            return this.readString(start, length);
        }
    }

    // ===========================
    //  HELPERS
    // ===========================

    /**
     * Get a human-readable codec name
     */
    static getCodecName(codecId) {
        const codecs = {
            'A_AAC': 'AAC',
            'A_AC3': 'AC3',
            'A_EAC3': 'E-AC3',
            'A_DTS': 'DTS',
            'A_FLAC': 'FLAC',
            'A_OPUS': 'Opus',
            'A_VORBIS': 'Vorbis',
            'A_MP3': 'MP3',
            'A_PCM/INT/LIT': 'PCM',
            'A_TRUEHD': 'TrueHD',
            'S_TEXT/UTF8': 'SRT',
            'S_TEXT/ASS': 'ASS',
            'S_TEXT/SSA': 'SSA',
            'S_TEXT/WEBVTT': 'WebVTT',
            'S_VOBSUB': 'VobSub',
            'S_HDMV/PGS': 'PGS',
            'S_DVBSUB': 'DVB',
            'V_MPEG4/ISO/AVC': 'H.264',
            'V_MPEGH/ISO/HEVC': 'H.265',
            'V_VP8': 'VP8',
            'V_VP9': 'VP9',
            'V_AV1': 'AV1',
        };

        for (const [prefix, name] of Object.entries(codecs)) {
            if (codecId.startsWith(prefix)) return name;
        }
        return codecId;
    }

    /**
     * Get language display name from ISO 639-2 code
     */
    static getLanguageName(code) {
        const languages = {
            'und': 'Undetermined',
            'eng': 'English',
            'hin': 'Hindi',
            'jpn': 'Japanese',
            'kor': 'Korean',
            'spa': 'Spanish',
            'fre': 'French',
            'fra': 'French',
            'ger': 'German',
            'deu': 'German',
            'ita': 'Italian',
            'por': 'Portuguese',
            'rus': 'Russian',
            'chi': 'Chinese',
            'zho': 'Chinese',
            'ara': 'Arabic',
            'tha': 'Thai',
            'vie': 'Vietnamese',
            'ind': 'Indonesian',
            'may': 'Malay',
            'msa': 'Malay',
            'tam': 'Tamil',
            'tel': 'Telugu',
            'ben': 'Bengali',
            'mar': 'Marathi',
            'urd': 'Urdu',
            'mal': 'Malayalam',
            'kan': 'Kannada',
            'guj': 'Gujarati',
            'pan': 'Punjabi',
            'tur': 'Turkish',
            'pol': 'Polish',
            'dut': 'Dutch',
            'nld': 'Dutch',
            'swe': 'Swedish',
            'nor': 'Norwegian',
            'dan': 'Danish',
            'fin': 'Finnish',
        };
        return languages[code] || code.toUpperCase();
    }

    /**
     * Check if a subtitle codec is text-based (extractable)
     */
    static isTextSubtitle(codecId) {
        return codecId.startsWith('S_TEXT/');
    }
}

// Export for use in player.js
window.MKVParser = MKVParser;
