export class AudioSystem {
  constructor(){
    this.enabled=false;
    this.musicEnabled=false;
    this.fx={};
    this.music=null;
    this.ambience=null;
  }

  async init(){
    if(this.enabled) return;
    const files=['gate','restraint','dispatch','brake','warning','whoosh','crowd'];
    for(const name of files){
      const a=new Audio(`assets/audio/${name}.wav`);
      a.preload='auto';
      this.fx[name]=a;
    }
    this.music=new Audio('assets/audio/music.wav');
    this.music.loop=true;
    this.music.volume=.32;

    this.ambience=new Audio('assets/audio/crowd.wav');
    this.ambience.loop=true;
    this.ambience.volume=.18;

    this.enabled=true;
    try{
      await this.ambience.play();
    }catch{}
  }

  async enableMusic(){
    await this.init();
    this.musicEnabled=true;
    try{ await this.music.play(); }catch{}
  }

  disableMusic(){
    this.musicEnabled=false;
    if(this.music) this.music.pause();
  }

  play(name, volume=.7, rate=1){
    if(!this.enabled) return;
    const src=this.fx[name];
    if(!src) return;
    const a=src.cloneNode();
    a.volume=Math.max(0,Math.min(1,volume));
    a.playbackRate=rate;
    a.play().catch(()=>{});
  }
}
