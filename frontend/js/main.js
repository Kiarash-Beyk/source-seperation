function folderBrowser() {
    return {
        //upload functions
        file: null,
        seperationStatus: "",
        //upload functions
        catchStatus:"",
        test_folders: [],
        selectedFolder: "",
        instruments: ["vocals", "other", "drums", "bass"],
        stemsAudioBuffer: {},
        audioCtx: null,
        sources: [],
        isPlaying: false,
        wasPlaying : false,
        resumeOffset: 0,
        playingSince: 0,
        currentRequestAbortController: null, // To handle request cancellation
        gainNodes: {},
        volumes :{
            vocals: 1.0 ,
            other: 1.0 ,
            drums: 1.0 ,
            bass: 1.0
        },
        beforeMute:{
            vocals: 0 ,
            other: 0 ,
            drums: 0 ,
            bass: 0
        },
        masterVolume: 0.5, // Add master volume (0 to 1)
        masterGainNode: null, // Master gain node

        //for audio playback current time
        currentTime: 0, // Current playback position in seconds
        duration: 0, // Total duration of the track
        isSeeking: false, // Flag to prevent updates during seek
        seekInterval: null, // For updating the timeline during playback




                //upload functions
         fileChosen(event) {
            this.file = event.target.files[0];
        }, 
        
        
        async uploadFile() {
            if (!this.file) return;
            
            let formData = new FormData();
            formData.append("file", this.file);
            this.seperationStatus = "Uploading...";

            try {
                
                let response = await axios.post('/seperate', formData, {
                    headers: { "Content-Type": "multipart/form-data" }
                });

                // axios data is in response.data, not response.json()
                if (response.data.success) {
                    this.seperationStatus = `Success! File: ${response.data.fileName}` 
                    this.getFolders()
                    this.selectedFolder = response.data.fileName.replace(/\.mp3$/i, "").trim();
                    console.log(this.selectedFolder)
                    this.cacheStems()
                } else {
                    this.seperationStatus = " Error: " + (response.data.error || "Unknown error");
                }
            } catch (error) {
                // Better error handling
                if (error.response) {
                    this.seperationStatus = " Server error: " + error.response.data.error;
                } else {
                    this.seperationStatus = "Connection error: " + error.message;
                }
            }
        },
        //upload functions

        async getFolders() {
            try {
                let res = await axios.get("/output-folder");
                this.test_folders = res.data.folders;
                console.log(this.test_folders)
                
            } catch (err) {
                console.error(`something happened to folders: ${err}`);
            }
            this.resetAll();
        },
        
        downloadStem(instrument) {
            if (!this.selectedFolder) return;
            
            const stemName = `${instrument}.flac`;
            const downloadUrl = `/download/${this.selectedFolder}/${stemName}`;
            
            // Create temporary link for download
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = stemName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

async cacheStems() {
    if (!this.selectedFolder) return;

    // Cancel any ongoing requests
    if (this.currentRequestAbortController) {
        this.currentRequestAbortController.abort();
    }

    // PROPER cleanup with memory management
    this.resetAll();
    this.stemsAudioBuffer = {};
    
    // Wait for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    try {
        this.currentRequestAbortController = new AbortController();
        const results = [];
        
        // Load stems SEQUENTIALLY with proper memory management
        for (const ins of this.instruments) {
            try {
                this.catchStatus = `Loading ${ins}...`;
                
                const response = await axios.get(
                    `/stems/${this.selectedFolder}/${ins}.flac`,
                    { 
                        responseType: "blob",
                        signal: this.currentRequestAbortController.signal,
                        timeout: 30000 // 30 second timeout
                    }
                );
                
                results.push({ ins, data: response.data, success: true });
                
            } catch (error) {
                console.error(`Failed to load ${ins}:`, error);
                results.push({ ins, error, success: false });
                
                // Continue with other stems even if one fails
                this.catchStatus = `Skipped ${ins}, continuing...`;
            }
            
            // CRITICAL: Add delay between requests
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (results.length < 4) {
            console.log('Missing stems:', results.length);
            this.catchStatus = `Only ${results.length}/4 stems loaded`;
        }

        // Process results with memory management
        this.stemsAudioBuffer = {};
        let successCount = 0;

        for (const result of results) {
            if (result.success) {
                try {
                    this.catchStatus = `Processing ${result.ins}...`;
                    
                    const arrayBuffer = await result.data.arrayBuffer();
                    const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
                    
                    this.stemsAudioBuffer[result.ins] = audioBuffer;
                    successCount++;
                    
                    // Free memory from the blob immediately
                    result.data = null;
                    
                    this.catchStatus = `Processed ${successCount}/${results.length}`;
                    
                } catch (processingError) {
                    console.error(`Failed to process ${result.ins}:`, processingError);
                }
            }
            
            // Add small delay between processing
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log("Cached stems:", Object.keys(this.stemsAudioBuffer));
        this.catchStatus = `Loaded ${successCount}/${this.instruments.length} stems`;

        // Set duration if we have at least one stem
        if (Object.keys(this.stemsAudioBuffer).length > 0) {
            const firstStem = Object.values(this.stemsAudioBuffer)[0];
            this.duration = firstStem.duration;
        }

    } catch (err) {
        if (err.name !== 'CanceledError') {
            console.error("Failed to cache stems:", err);
            this.catchStatus = "Failed to load stems - see console";
        }
    } finally {
        this.currentRequestAbortController = null;
        // Force garbage collection after operation
    }
},


        // Modified initAudioContext to ensure it's ready
        async initAudioContext() {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                await this.setupMasterGain(); // Make this async
            }
            // Resume if suspended
            if (this.audioCtx.state === 'suspended') {
                await this.audioCtx.resume();
            }
        },

        // Make setupMasterGain async to ensure completion
        async setupMasterGain() {
            this.masterGainNode = this.audioCtx.createGain();
            this.masterGainNode.gain.value = this.masterVolume;
            this.masterGainNode.connect(this.audioCtx.destination);
            return new Promise(resolve => {
                // Small delay to ensure node is ready
                setTimeout(resolve, 50);
            });
        },

        // Update master volume
        updateMasterVolume(value) {
            this.masterVolume = value;
            if (this.masterGainNode) {
                this.masterGainNode.gain.value = value;
            }
        },
        async playAll() {
            try {
                await this.initAudioContext(); // Wait for context to be ready
                
                if (this.isPlaying) return;
                if (Object.keys(this.stemsAudioBuffer).length === 0) return;

                // Ensure masterGainNode exists and belongs to current context
                if (!this.masterGainNode || this.masterGainNode.context !== this.audioCtx) {
                    await this.setupMasterGain();
                }

                const startTime = this.audioCtx.currentTime + 0.05;
                this.playingSince = this.audioCtx.currentTime;

                this.stopAllSources();
                this.sources = []; 
                this.gainNodes = {}; // Clear previous gain nodes

                for (let [ins, buffer] of Object.entries(this.stemsAudioBuffer)) {
                    if (!buffer) continue;

                    // Create new gain node for current context
                    const gainNode = this.audioCtx.createGain();
                    gainNode.gain.value = this.volumes[ins];
                    
                    // Verify nodes exist before connecting
                    if (!gainNode) throw new Error("Gain node not created");
                    if (!this.masterGainNode) throw new Error("Master gain not ready");
                    
                    gainNode.connect(this.masterGainNode);
                    this.gainNodes[ins] = gainNode;

                    const source = this.audioCtx.createBufferSource();
                    source.buffer = buffer;
                    source.connect(gainNode);
                    source.start(startTime, this.resumeOffset);
                    
                    this.sources.push(source);
                }

                this.isPlaying = true;

                // Start timeline updates
                this.startTimelineUpdates();

            } catch (error) {
                console.error("Playback error:", error);
                this.resetAll();
            }
        },

        // to update volume
        updateVolume(instrument, value) {
            this.volumes[instrument] = value;
            
            // If currently playing, update the gain node immediately
            if (this.gainNodes[instrument]) {
                this.gainNodes[instrument].gain.value = value;
            }
        },
        muteVolume(instrument) {
            // Initialize beforeMute if it doesn't exist
            if (!this.beforeMute) {
                this.beforeMute = {};
            }
            
            // If currently muted (volume is 0), restore previous volume
            if (this.volumes[instrument] === 0) {
                this.volumes[instrument] = this.beforeMute[instrument] || 1.0; // Default to 1.0 if no beforeMute value
            } 
            // If not muted, store current volume and mute
            else {
                this.beforeMute[instrument] = this.volumes[instrument];
                this.volumes[instrument] = 0;
            }

            // Update the actual gain node if it exists
            if (this.gainNodes[instrument]) {
                this.gainNodes[instrument].gain.value = this.volumes[instrument];
            }
        },
        pauseAll() {
            if (!this.isPlaying) return;

            const elapsed = this.audioCtx.currentTime - this.playingSince;
            this.resumeOffset += elapsed;

            this.stopAllSources();
            this.isPlaying = false;

             // Stop timeline updates
            this.stopTimelineUpdates();
        },

        stopAllSources() {
            this.sources.forEach(src => {
                try {
                    src.stop();
                    src.disconnect();
                } catch (e) {
                    console.warn("Error stopping source:", e);
                }
            });
            this.sources = [];
        },
        // Timeline control methods
        startTimelineUpdates() {
            this.stopTimelineUpdates();
            this.seekInterval = setInterval(() => {
                if (!this.isSeeking && this.isPlaying) {
                    const elapsed = this.audioCtx.currentTime - this.playingSince;
                    this.currentTime = this.resumeOffset + elapsed;
                }
            }, 100);
        },

        stopTimelineUpdates() {
            if (this.seekInterval) {
                clearInterval(this.seekInterval);
                this.seekInterval = null;
            }
        },

        // Handle timeline seeking
        seekStart() {
            this.isSeeking = true;
            if(this.isPlaying){
                this.wasPlaying=true
            }else{
                this.wasPlaying=false
            }
            this.pauseAll();
        },

        async seekTo(time) {
            this.currentTime = Math.max(0, Math.min(time, this.duration));
            
            // Update resume offset for when playback resumes
            this.resumeOffset = this.currentTime;
            
            // If playing, restart playback from new position
            if (this.isPlaying) {
                this.playAll();
                console.log('is playing')
            }
        },

        seekEnd() {
            this.isSeeking = false;
            if (this.wasPlaying) {
                this.playAll();
                
            }
            
        },

        // Format time for display (MM:SS)
        formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        },

        resetAll() {
    // Stop all audio sources
        this.stopAllSources();
        
        // Close and null the audio context
        if (this.audioCtx) {
            this.audioCtx.close().catch(() => {});
            this.audioCtx = null;
        }
        
        // Clear all buffers and state
        this.stemsAudioBuffer = {};
        this.sources = [];
        this.gainNodes = {};
        this.resumeOffset = 0;
        this.isPlaying = false;
        this.sources=[]
        // Force garbage collection (where supported)
        if (window.gc) {
            window.gc();
        }
        },

        init() {
            this.resetAll()
            this.getFolders();
        }
    };
}