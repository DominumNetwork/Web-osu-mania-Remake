export class AudioManager {
  private context: AudioContext;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private startTime: number = 0;
  private pauseTime: number = 0;
  private isPlaying: boolean = false;
  private gainNode: GainNode;
  private _playbackRate: number = 1.0;

  constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.context.destination);
  }

  async loadAudio(blob: Blob) {
    const arrayBuffer = await blob.arrayBuffer();
    this.buffer = await this.context.decodeAudioData(arrayBuffer);
  }

  get playbackRate(): number {
      return this._playbackRate;
  }

  set playbackRate(val: number) {
      this._playbackRate = val;
      if (this.source) {
          this.source.playbackRate.value = val;
      }
  }

  async resumeContext() {
      if (this.context.state === 'suspended') {
          await this.context.resume();
      }
  }

  play(offset: number = 0) {
    if (!this.buffer) return;
    this.resumeContext();
    if (this.isPlaying) this.stop();

    this.source = this.context.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.gainNode);
    this.source.playbackRate.value = this._playbackRate;
    
    this.startTime = this.context.currentTime - (offset / this._playbackRate);
    
    if (offset < 0) {
         this.source.start(this.context.currentTime + (Math.abs(offset) / this._playbackRate), 0);
    } else {
         this.source.start(0, offset);
    }
    
    this.isPlaying = true;
  }

  pause() {
    if (!this.isPlaying) return;
    this.source?.stop();
    this.pauseTime = (this.context.currentTime - this.startTime) * this._playbackRate;
    this.isPlaying = false;
  }

  stop() {
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {
      }
    }
    this.isPlaying = false;
    this.pauseTime = 0;
  }

  getCurrentTime(): number {
    if (this.isPlaying) {
      return (this.context.currentTime - this.startTime) * this._playbackRate * 1000;
    }
    return this.pauseTime * 1000;
  }

  setVolume(vol: number) {
    this.gainNode.gain.value = vol;
  }
}

export const audioManager = new AudioManager();