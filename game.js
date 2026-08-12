(function(){
'use strict';
const $=id=>document.getElementById(id),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rand=(a,b)=>a+Math.random()*(b-a);
if(!window.THREE){$('bootText').textContent='3D engine failed to load.';$('retry').hidden=false;$('retry').onclick=()=>location.reload();return}

let renderer,scene,camera,clock,curve,selectedTrain=0,cameraMode=0,running=false,paused=false;
const trainGroups=[],trainStates=[],guests=[],entryGates=[],exitGates=[];
const blockOrder=['STATION','LIFT','MID','FINAL'];
const blockPhases={STATION:.005,LIFT:.21,MID:.56,FINAL:.88};
const blockEnabled={STATION:true,LIFT:false,MID:false,FINAL:false};

const S={time:300,queue:48,served:0,tph:0,score:0,entry:false,exit:false,checked:false,hold:false,estop:false,reliability:100,nextEvent:25};

try{init3D();bindUI();updateUI();$('boot').classList.add('hidden');$('game').classList.remove('hidden');log('V8 manual block simulator ready.','good')}
catch(e){console.error(e);$('bootText').textContent='Startup failed: '+e.message;$('retry').hidden=false;$('retry').onclick=()=>location.reload()}

function init3D(){
 const mount=$('scene');
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));renderer.setSize(innerWidth,innerHeight,false);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;mount.appendChild(renderer.domElement);

 scene=new THREE.Scene();scene.background=new THREE.Color(0x07111b);scene.fog=new THREE.FogExp2(0x07111b,.0068);
 camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,800);camera.position.set(-22,7,-15);

 scene.add(new THREE.HemisphereLight(0x99bce2,0x1a241b,1.5));
 const sun=new THREE.DirectionalLight(0xe6efff,2.5);sun.position.set(-35,50,25);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);scene.add(sun);

 const ground=new THREE.Mesh(new THREE.PlaneGeometry(240,240),mat(0x193724,0,1));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
 buildWorld();buildStation();buildTrack();buildTrains();buildGuests();
 clock=new THREE.Clock();addEventListener('resize',resize);renderer.setAnimationLoop(loop);
}

function mat(color,metal=.2,rough=.6){return new THREE.MeshStandardMaterial({color,metalness:metal,roughness:rough})}

function buildWorld(){
 for(let i=0;i<85;i++){
  const a=Math.random()*Math.PI*2,r=38+Math.random()*65,x=Math.cos(a)*r,z=Math.sin(a)*r,s=.6+Math.random()*.8;
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.14*s,.22*s,2.5*s,7),mat(0x553820,.05,.95));trunk.position.set(x,1.25*s,z);scene.add(trunk);
  const crown=new THREE.Mesh(new THREE.ConeGeometry(1.45*s,4.2*s,10),mat(0x18452a,0,1));crown.position.set(x,3.7*s,z);crown.castShadow=true;scene.add(crown);
 }
}

function buildStation(){
 const steel=mat(0x7c8792,.82,.32),dark=mat(0x111921,.58,.35),concrete=mat(0x343b42,.05,.82),yellow=mat(0xe4c54d,.5,.38);
 const slab=new THREE.Mesh(new THREE.BoxGeometry(34,1,16),concrete);slab.position.set(-2,.5,0);slab.receiveShadow=true;scene.add(slab);

 // deep central track trench
 const trench=new THREE.Mesh(new THREE.BoxGeometry(28,.55,5),mat(0x070a0e,.2,.6));trench.position.set(-2,1,0);scene.add(trench);

 // platforms
 const p1=new THREE.Mesh(new THREE.BoxGeometry(28,.35,4.7),concrete);p1.position.set(-2,1.2,-5.25);scene.add(p1);
 const p2=p1.clone();p2.position.z=5.25;scene.add(p2);

 // tactile yellow edges
 for(const z of [-2.75,2.75]){
  const edge=new THREE.Mesh(new THREE.BoxGeometry(28,.08,.35),yellow);edge.position.set(-2,1.43,z);scene.add(edge)
 }

 // roof, columns, trusses
 const roof=new THREE.Mesh(new THREE.BoxGeometry(36,.7,17),dark);roof.position.set(-2,10,0);roof.castShadow=true;scene.add(roof);
 for(const x of [-17,-12,-7,-2,3,8,13]){
  for(const z of [-7.2,7.2]){
   const col=new THREE.Mesh(new THREE.BoxGeometry(.35,8.8,.35),steel);col.position.set(x,5,z);col.castShadow=true;scene.add(col)
  }
  const beam=new THREE.Mesh(new THREE.BoxGeometry(.25,.25,14.5),steel);beam.position.set(x,9.3,0);scene.add(beam)
 }

 // operator booth
 const booth=new THREE.Mesh(new THREE.BoxGeometry(5.2,4.2,4.2),dark);booth.position.set(-13,3.2,-6.3);booth.castShadow=true;scene.add(booth);
 const windowMat=new THREE.MeshStandardMaterial({color:0x6ea1b8,transparent:true,opacity:.48,metalness:.35,roughness:.2});
 const win=new THREE.Mesh(new THREE.BoxGeometry(4.4,1.8,.08),windowMat);win.position.set(-13,3.55,-4.17);scene.add(win);

 // lights
 for(let i=0;i<8;i++){const l=new THREE.PointLight(0xfff0c7,.8,18,2);l.position.set(-16+i*4.2,8.7,0);scene.add(l)}

 // physical gates
 for(let i=0;i<9;i++){
  const x=-14+i*3.1;
  entryGates.push(makeGate(x,-3.0,yellow,steel));
  exitGates.push(makeGate(x,3.0,yellow,steel));
 }

 // queue fences
 for(let r=0;r<4;r++){
  const rail=new THREE.Mesh(new THREE.BoxGeometry(18,.1,.1),steel);rail.position.set(-5,2.1,-9-r*1.5);scene.add(rail);
  for(let i=0;i<7;i++){const post=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,1.25,6),steel);post.position.set(-14+i*3,1.55,-9-r*1.5);scene.add(post)}
 }
}

function makeGate(x,z,yellow,steel){
 const g=new THREE.Group();
 const post=new THREE.Mesh(new THREE.CylinderGeometry(.08,.1,1.5,8),steel);post.position.y=.75;g.add(post);
 const arm=new THREE.Mesh(new THREE.BoxGeometry(.12,.9,2.4),yellow);arm.position.set(0,.8,1.1);g.add(arm);
 g.position.set(x,1.45,z);scene.add(g);return g;
}

function buildTrack(){
 const pts=[[-16,2,0],[-5,2,0],[8,2,-1],[20,4,-7],[30,16,-16],[27,29,-26],[15,39,-34],[-1,40,-35],[-17,31,-30],[-28,14,-20],[-34,5,-7],[-31,3,10],[-21,8,24],[-6,17,31],[12,20,27],[27,11,17],[34,4,3],[25,3,-4],[12,2,0]].map(p=>new THREE.Vector3(...p));
 curve=new THREE.CatmullRomCurve3(pts,true,'catmullrom',.18);

 // true-looking twin rails using offset tube curves
 const sampleCount=520,left=[],right=[];
 for(let i=0;i<sampleCount;i++){
  const t=i/(sampleCount-1),p=curve.getPointAt(t),tan=curve.getTangentAt(t).normalize();
  const side=new THREE.Vector3().crossVectors(tan,new THREE.Vector3(0,1,0)).normalize();
  left.push(p.clone().add(side.clone().multiplyScalar(.62)));
  right.push(p.clone().add(side.clone().multiplyScalar(-.62)));
 }
 const leftCurve=new THREE.CatmullRomCurve3(left,true),rightCurve=new THREE.CatmullRomCurve3(right,true);
 const railMat=mat(0xc82434,.9,.22);
 [leftCurve,rightCurve].forEach(c=>{const r=new THREE.Mesh(new THREE.TubeGeometry(c,900,.11,9,true),railMat);r.castShadow=true;scene.add(r)});

 const tieMat=mat(0x424950,.72,.4),supportMat=mat(0x6e7882,.82,.33),brakeMat=mat(0xdac84b,.65,.3);
 for(let i=0;i<260;i++){
  const t=i/260,p=curve.getPointAt(t),tan=curve.getTangentAt(t).normalize(),side=new THREE.Vector3().crossVectors(tan,new THREE.Vector3(0,1,0)).normalize();
  const tie=new THREE.Mesh(new THREE.BoxGeometry(1.7,.1,.12),tieMat);tie.position.copy(p);tie.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),side);scene.add(tie);
  if(i%8===0&&p.y>2.7){
   const h=p.y;
   const a=new THREE.Mesh(new THREE.CylinderGeometry(.08,.13,h,7),supportMat);a.position.set(p.x+.45,h/2,p.z);a.rotation.z=.05;scene.add(a);
   const b=a.clone();b.position.x=p.x-.45;b.rotation.z=-.05;scene.add(b);
   const cross=new THREE.Mesh(new THREE.BoxGeometry(1.2,.08,.08),supportMat);cross.position.set(p.x,h*.55,p.z);scene.add(cross);
  }
 }

 // brake fins at station/final
 [.005,.88].forEach(start=>{
  for(let i=0;i<20;i++){
   const p=curve.getPointAt((start+i*.0028)%1),fin=new THREE.Mesh(new THREE.BoxGeometry(.08,.38,.55),brakeMat);
   fin.position.copy(p);fin.position.y+=.2;scene.add(fin)
  }
 });

 // lift catwalk + chain look
 for(let i=0;i<40;i++){
  const t=.11+i*.0032,p=curve.getPointAt(t),tan=curve.getTangentAt(t).normalize(),side=new THREE.Vector3().crossVectors(tan,new THREE.Vector3(0,1,0)).normalize();
  const tooth=new THREE.Mesh(new THREE.BoxGeometry(.22,.08,.22),brakeMat);tooth.position.copy(p);tooth.position.y+=.12;scene.add(tooth);
  if(i%2===0){const walk=new THREE.Mesh(new THREE.BoxGeometry(.7,.08,.4),mat(0x4b5055,.65,.5));walk.position.copy(p).add(side.multiplyScalar(1.1));scene.add(walk)}
 }
}

function buildTrains(){
 const colors=[0xe1293b,0x2d7fd7,0xf3ad26];
 colors.forEach((color,idx)=>{
  const g=new THREE.Group(),bodyMat=mat(color,.72,.21),dark=mat(0x121820,.35,.48),metal=mat(0x8d98a2,.85,.28),rubber=mat(0x090b0d,.1,.82);
  for(let c=0;c<6;c++){
   const z=c*1.65;
   const chassis=new THREE.Mesh(new THREE.BoxGeometry(2.45,.42,1.5),bodyMat);chassis.position.set(0,.34,z);chassis.castShadow=true;g.add(chassis);
   const fairing=new THREE.Mesh(new THREE.BoxGeometry(2.05,.5,1.25),bodyMat);fairing.position.set(0,.72,z);g.add(fairing);
   const seat=new THREE.Mesh(new THREE.BoxGeometry(1.55,.48,1.0),dark);seat.position.set(0,1.02,z);g.add(seat);
   const back=new THREE.Mesh(new THREE.BoxGeometry(1.6,.9,.18),dark);back.position.set(0,1.34,z+.35);g.add(back);
   const bar=new THREE.Mesh(new THREE.TorusGeometry(.48,.055,8,18,Math.PI),metal);bar.rotation.z=Math.PI/2;bar.position.set(0,1.38,z-.08);g.add(bar);

   // bogies/wheels
   for(const dz of [-.48,.48])for(const x of [-.72,.72]){
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.12,12),rubber);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.14,z+dz);g.add(wheel)
   }
  }
  g.scale.set(.83,.83,.83);scene.add(g);trainGroups.push(g)
 });

 trainStates.push(
  {block:'STATION',phase:blockPhases.STATION,target:null,moving:false,load:0,restraints:false,checked:false},
  {block:'LIFT',phase:blockPhases.LIFT,target:null,moving:false,load:24,restraints:true,checked:true},
  {block:'MID',phase:blockPhases.MID,target:null,moving:false,load:24,restraints:true,checked:true}
 );
}

function buildGuests(){
 for(let i=0;i<80;i++){
  const g=new THREE.Group(),shirt=mat(new THREE.Color().setHSL(Math.random(),.58,.54),0,.85),skin=mat(0xd8a47c,0,.9),pants=mat(0x26313d,.05,.8);
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.19,.54,4,7),shirt);torso.position.y=1.0;g.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),skin);head.position.y=1.56;g.add(head);
  const legs=new THREE.Mesh(new THREE.BoxGeometry(.32,.58,.2),pants);legs.position.y=.42;g.add(legs);
  scene.add(g);guests.push(g)
 }
}

function bindUI(){
 $('play').onclick=()=>{$('intro').classList.add('hidden');running=true;log('Shift started. Enable blocks manually.','good')};
 $('again').onclick=()=>location.reload();
 $('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'RESUME':'PAUSE'};

 $('entryBtn').onclick=()=>{if(!stationSelected())return reject('Select the station train first.');if(S.estop||S.hold)return reject('Ride not available.');const tr=trainStates[stationTrainIndex()];if(tr.restraints)return reject('Release restraints first.');S.entry=!S.entry;S.checked=false;tr.checked=false;log('Entry gates '+(S.entry?'opened.':'closed.'));updateUI()};
 $('exitBtn').onclick=()=>{if(!stationSelected())return reject('Select the station train first.');if(S.estop||S.hold)return reject('Ride not available.');S.exit=!S.exit;S.checked=false;log('Exit gates '+(S.exit?'opened.':'closed.'));updateUI()};
 $('restraintBtn').onclick=()=>{if(!stationSelected())return reject('Select the station train first.');const tr=trainStates[stationTrainIndex()];if(S.entry||S.exit)return reject('Close station gates first.');if(tr.load<24)return reject('Train is not full.');tr.restraints=!tr.restraints;tr.checked=false;log('Train restraints '+(tr.restraints?'locked.':'released.'),tr.restraints?'good':'');updateUI()};
 $('checkBtn').onclick=()=>{if(!stationSelected())return reject('Select the station train first.');const tr=trainStates[stationTrainIndex()];if(tr.load<24||!tr.restraints||S.entry||S.exit)return reject('Station not ready for platform check.');tr.checked=true;log('Platform check complete.','good');updateUI()};
 $('holdBtn').onclick=()=>{S.hold=!S.hold;log('Ride hold '+(S.hold?'applied.':'released.'),S.hold?'bad':'good');updateUI()};
 $('estop').onclick=()=>{S.estop=!S.estop;log(S.estop?'Emergency stop active.':'Emergency stop reset.',S.estop?'bad':'good');updateUI()};
 $('moveBtn').onclick=manualDispatch;

 document.querySelectorAll('.trainTab').forEach(b=>b.onclick=()=>{selectedTrain=Number(b.dataset.train);document.querySelectorAll('.trainTab').forEach(x=>x.classList.toggle('active',x===b));updateUI()});
 document.querySelectorAll('.cam').forEach(b=>b.onclick=()=>{cameraMode=Number(b.dataset.cam);document.querySelectorAll('.cam').forEach(x=>x.classList.toggle('active',x===b))});

 [['enableStation','STATION'],['enableLift','LIFT'],['enableMid','MID'],['enableFinal','FINAL']].forEach(([id,name])=>{
  $(id).onclick=()=>{blockEnabled[name]=!blockEnabled[name];log(name+' block '+(blockEnabled[name]?'enabled.':'locked.'),blockEnabled[name]?'good':'');updateUI()}
 });
}

function stationTrainIndex(){return trainStates.findIndex(t=>t.block==='STATION'&&!t.moving)}
function stationSelected(){return stationTrainIndex()===selectedTrain}
function occupied(block){return trainStates.some(t=>t.block===block&&!t.moving)}
function nextBlock(block){const i=blockOrder.indexOf(block);return blockOrder[(i+1)%blockOrder.length]}

function canMoveTrain(i){
 const tr=trainStates[i];if(S.estop||S.hold||tr.moving)return false;
 const next=nextBlock(tr.block);
 if(!blockEnabled[next]||occupied(next))return false;
 if(tr.block==='STATION'){
  if(tr.load<24||!tr.restraints||!tr.checked||S.entry||S.exit)return false;
 }
 return true;
}

function manualDispatch(){
 if(!canMoveTrain(selectedTrain))return reject('Selected train cannot dispatch.');
 const tr=trainStates[selectedTrain],from=tr.block,to=nextBlock(from);
 tr.moving=true;tr.target=to;tr.startPhase=tr.phase;tr.endPhase=blockPhases[to];
 if(to==='STATION'&&tr.endPhase<tr.startPhase)tr.endPhase+=1;
 log('Train '+(selectedTrain+1)+' dispatched '+from+' â '+to+'.','good');
 updateUI()
}

function tick(dt){
 S.time-=dt;if(S.time<=0){S.time=0;finish();return}
 S.queue=clamp(S.queue+dt*.17,0,160);

 const si=stationTrainIndex();
 if(si>=0){
  const tr=trainStates[si];
  if(S.exit&&tr.load>0){
   const u=Math.min(tr.load,dt*13);tr.load-=u;
   if(tr.load<.05){tr.load=0;S.served+=24;log('Train '+(si+1)+' unloaded.','good')}
  }
  if(S.entry&&!tr.restraints){
   const b=Math.min(S.queue,24-tr.load,dt*9);tr.load+=b;S.queue-=b;
  }
 }

 trainStates.forEach((tr,i)=>{
  if(!tr.moving)return;
  const end=tr.endPhase,start=tr.startPhase;
  const total=end-start;
  tr.phase+=dt*.055;
  let cur=tr.phase;if(cur<start)cur+=1;
  if(cur>=end){
   tr.phase=blockPhases[tr.target];
   tr.block=tr.target;tr.target=null;tr.moving=false;
   if(tr.block==='STATION'){S.entry=false;S.exit=false;tr.restraints=false;tr.checked=false;log('Train '+(i+1)+' stopped in station.','good')}
   else log('Train '+(i+1)+' stopped in '+tr.block+'.','good');
  }else tr.phase%=1;
 });

 S.nextEvent-=dt;if(S.nextEvent<=0){S.nextEvent=rand(24,38);if(Math.random()<.5){S.reliability=Math.max(75,S.reliability-1);log('Operator message: check platform conditions.','bad')}else log('Queue surge at entrance.')}

 const elapsed=Math.max(1,300-S.time);S.tph=Math.round(S.served/(elapsed/3600));S.score=Math.round(S.served*12+S.reliability*2-S.queue*.55);
 updateGuests();updateUI()
}

function updateGuests(){
 const visible=Math.min(guests.length,Math.round(S.queue/2));
 guests.forEach((g,i)=>{g.visible=i<visible;if(!g.visible)return;const row=Math.floor(i/10),col=i%10;g.position.set(-16+col*.7,1.4,-9-row*.65);g.rotation.y=Math.sin(performance.now()*.001+i)*.12})
}

function animateStation(){
 const e=S.entry?Math.PI/2:0,x=S.exit?-Math.PI/2:0;
 entryGates.forEach(g=>g.rotation.y+=(e-g.rotation.y)*.12);exitGates.forEach(g=>g.rotation.y+=(x-g.rotation.y)*.12)
}

function updateTrains(){
 trainGroups.forEach((g,i)=>{
  const tr=trainStates[i],p=curve.getPointAt(tr.phase%1),tan=curve.getTangentAt(tr.phase%1).normalize();
  g.position.copy(p);g.position.y+=.15;g.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),tan)
 })
}

function updateCamera(dt){
 let pos=new THREE.Vector3(),look=new THREE.Vector3();
 if(cameraMode===0){pos.set(-13,5.5,-10.8);look.set(-2,2.4,0)}
 else if(cameraMode===1){pos.set(-30,8,17);look.set(-5,3,0)}
 else if(cameraMode===2){pos.set(27,23,-11);look.set(14,22,-22)}
 else if(cameraMode===3){pos.set(19,18,44);look.set(7,14,5)}
 else if(cameraMode===4){
  const tr=trainStates[selectedTrain],p=curve.getPointAt(tr.phase%1),tan=curve.getTangentAt(tr.phase%1).normalize();
  pos.copy(p).add(new THREE.Vector3(0,2.8,0)).add(tan.clone().multiplyScalar(-7));look.copy(p).add(tan.clone().multiplyScalar(5))
 }else{pos.set(0,62,76);look.set(0,8,2)}
 camera.position.lerp(pos,1-Math.pow(.001,dt));camera.lookAt(look)
}

function updateUI(){
 $('time').textContent=fmt(S.time);$('queue').textContent=Math.round(S.queue);$('tph').textContent=S.tph;$('score').textContent=Math.max(0,S.score);

 const tr=trainStates[selectedTrain];
 $('trainLocation').textContent=tr.moving?tr.block+' â '+tr.target:tr.block;
 $('trainStatus').textContent=tr.moving?'MOVING':'STOPPED';
 $('loadLabel').textContent=Math.floor(tr.load)+' / 24';$('restraintLabel').textContent=tr.restraints?'LOCKED':'OPEN';

 const move=$('moveBtn');move.disabled=!canMoveTrain(selectedTrain);move.querySelector('small').textContent=move.disabled?'BLOCKED':'READY';move.querySelector('strong').textContent='DISPATCH T'+(selectedTrain+1);

 const stationIdx=stationTrainIndex();
 $('entryBtn').classList.toggle('on',S.entry);$('exitBtn').classList.toggle('on',S.exit);
 if(stationIdx>=0){$('restraintBtn').classList.toggle('on',trainStates[stationIdx].restraints);$('checkBtn').classList.toggle('on',trainStates[stationIdx].checked)}
 else{$('restraintBtn').classList.remove('on');$('checkBtn').classList.remove('on')}
 $('holdBtn').classList.toggle('warn',S.hold);

 blockOrder.forEach(name=>{
  const idx=trainStates.findIndex(t=>t.block===name&&!t.moving);
  const id={STATION:'bStation',LIFT:'bLift',MID:'bMid',FINAL:'bFinal'}[name];
  $(id).textContent=idx>=0?'T'+(idx+1):'â';
  const card={STATION:'blkStation',LIFT:'blkLift',MID:'blkMid',FINAL:'blkFinal'}[name];
  $(card).classList.toggle('occupied',idx>=0);$(card).classList.toggle('clear',idx<0);
  const btn={STATION:'enableStation',LIFT:'enableLift',MID:'enableMid',FINAL:'enableFinal'}[name];
  $(btn).textContent=blockEnabled[name]?'ENABLED':'LOCKED';$(btn).classList.toggle('on',blockEnabled[name])
 });

 let obj='Select a train';
 if(tr.moving)obj='Train moving to '+tr.target;
 else if(tr.block==='STATION'&&tr.load<24)obj='Load Train '+(selectedTrain+1);
 else if(tr.block==='STATION'&&!tr.restraints)obj='Lock restraints';
 else if(tr.block==='STATION'&&!tr.checked)obj='Check platform';
 else if(!blockEnabled[nextBlock(tr.block)])obj='Enable '+nextBlock(tr.block)+' block';
 else if(occupied(nextBlock(tr.block)))obj='Wait for '+nextBlock(tr.block)+' to clear';
 else obj='Dispatch Train '+(selectedTrain+1);
 $('objective').textContent=obj;
 $('objectiveText').textContent='Every train movement is manual. Trains stop at the next block and wait for another dispatch.';

 const lamp=$('lamp');lamp.className='lamp '+(S.estop?'fault':S.hold?'warn':'');lamp.querySelector('span').textContent=S.estop?'E-STOP ACTIVE':S.hold?'RIDE HOLD':canMoveTrain(selectedTrain)?'DISPATCH READY':'SYSTEM READY'
}

function loop(){
 const dt=Math.min(clock.getDelta(),.05);if(running&&!paused&&!S.estop)tick(dt);animateStation();updateTrains();updateCamera(dt);renderer.render(scene,camera)
}
function reject(m){log(m,'bad')}
function log(m,type=''){const d=document.createElement('div');d.className=type;d.textContent=fmt(S.time)+'  '+m;$('log').prepend(d);while($('log').children.length>10)$('log').lastChild.remove()}
function fmt(s){s=Math.max(0,Math.ceil(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function finish(){running=false;const grade=S.score>3200?'A':S.score>2300?'B':'C';$('grade').textContent='GRADE '+grade;$('result').textContent='Served '+S.served+' guests. Throughput '+S.tph+'/h. Score '+Math.max(0,S.score)+'.';$('finish').classList.remove('hidden')}
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
})();
