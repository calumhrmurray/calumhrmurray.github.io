/* =================================================================
   Live cosmic-web orbit — WebGL engine over the FULL NGC CMASS cap
   (window.WEB_DATA, ~544k galaxies). One shared GL context renders to
   an offscreen canvas, blitted onto the active field slide.

   Controls (field slides):  scroll = zoom · drag = rotate.  Auto-orbits when idle.
   Slice slide also:  ↑/↓ or shift+scroll = scrub the slab through depth · [ / ] = slab thickness.

   Modes:
     density  — HDR additive accumulation into a float framebuffer, then a
                tone-mapped INFERNO pass (the proper N-body density-field render;
                self-normalising, so it never blows out or vanishes).
     galaxies — depth-tested dots, viridis by local density (the 3D tracer field).
     slice    — a thin world-fixed slab of those dots along the z principal axis;
                manually scrubbed through depth so the cosmic web separates cleanly
                (the full-volume projection piles filaments up and washes them out).
     velocity — dimmed field + reconstructed Ψ flow as streaks (inferno by speed).
     shapes   — dimmed field + weak-lensing WHISKERS (shape major axis in the
                plane of the sky), coloured by |e|.
   ================================================================= */
(function(){
 // One independent engine instance per dataset. SRC = the canvas data-src this
 // instance owns ('' = the default CMASS canvases; 'bgs' = the BGS field slide).
 function makeOrbit(D, SRC){
  if(!D || !D.pos){ return; }

  /* ---------- decode quantised base64 → typed arrays ---------- */
  function bytes(b64){ const s=atob(b64), n=s.length, u=new Uint8Array(n);
    for(let i=0;i<n;i++) u[i]=s.charCodeAt(i); return u; }
  const N=D.n, IQ=1/D.posq, SCALE_MPCH=D.scale_mpch||1000;
  const posI=new Int16Array(bytes(D.pos).buffer);
  const dU=bytes(D.d);
  const posF=new Float32Array(3*N), dF=new Float32Array(N);
  for(let i=0;i<3*N;i++) posF[i]=posI[i]*IQ;
  for(let i=0;i<N;i++) dF[i]=dU[i]/255;

  // optional overlay point cloud (combined CMASS+BGS slide) — already in this frame
  const hasOv = !!D.pos2; let ovPosF=null, ovDF=null, ovN=0;
  if(hasOv){ ovN=D.n2; const oP=new Int16Array(bytes(D.pos2).buffer), oD=bytes(D.d2);
    ovPosF=new Float32Array(3*ovN); for(let i=0;i<3*ovN;i++) ovPosF[i]=oP[i]*IQ;
    ovDF=new Float32Array(ovN); for(let i=0;i<ovN;i++) ovDF[i]=oD[i]/255; }

  // pre-traced field streamlines (line segments): int16 positions -> scaled float
  function segFloat(b){ const s=new Int16Array(bytes(b).buffer), f=new Float32Array(s.length);
    for(let i=0;i<s.length;i++) f[i]=s[i]*IQ; return f; }
  function valFloat(b){ const u=bytes(b), f=new Float32Array(u.length);
    for(let i=0;i<u.length;i++) f[i]=u[i]/255; return f; }
  const velSeg=segFloat(D.velSeg), velValF=valFloat(D.velVal), NV_VEL=D.nvVel;
  const shpSeg=segFloat(D.shpSeg), shpValF=valFloat(D.shpVal), NV_SHP=D.nvShp;

  /* ---------- colour LUTs ---------- */
  function lut(stops){ const a=new Uint8Array(256*4);
    for(let i=0;i<256;i++){ const t=i/255; let p=stops[0],q=stops[stops.length-1];
      for(let k=0;k<stops.length-1;k++){ if(t>=stops[k][0]&&t<=stops[k+1][0]){p=stops[k];q=stops[k+1];break;} }
      const u=(t-p[0])/((q[0]-p[0])||1);
      a[i*4]=p[1]+(q[1]-p[1])*u; a[i*4+1]=p[2]+(q[2]-p[2])*u; a[i*4+2]=p[3]+(q[3]-p[3])*u; a[i*4+3]=255; }
    return a; }
  const INFERNO=lut([[0,0,0,4],[.13,31,12,72],[.25,85,15,109],[.38,136,34,106],
    [.50,186,54,85],[.63,227,89,51],[.75,249,140,10],[.87,249,201,50],[1,252,255,164]]);
  const VIRIDIS=lut([[0,68,1,84],[.25,59,82,139],[.5,33,145,140],[.75,94,201,98],[1,253,231,37]]);
  const WHISK  =lut([[0,72,86,180],[.5,120,150,230],[1,150,225,255]]);
  const GOLD   =lut([[0,28,16,5],[.35,150,88,26],[.7,236,176,82],[1,255,248,222]]);  // Laniakea-style flow
  const PALE   =lut([[0,108,134,180],[1,226,233,255]]);                               // faint galaxy specks
  const REDS   =lut([[0,38,2,6],[.3,120,16,20],[.6,205,42,36],[.8,242,120,70],[1,255,224,190]]);   // CMASS scheme
  const BLUES  =lut([[0,4,10,42],[.3,20,46,128],[.6,42,96,205],[.8,92,160,238],[1,205,228,255]]);  // BGS scheme

  /* ---------- GL setup ---------- */
  const glc=document.createElement('canvas');
  const gl=glc.getContext('webgl',{antialias:true,alpha:true,premultipliedAlpha:false});
  let GLOK=!!gl;
  const uloc=(p,n)=>gl.getUniformLocation(p,n);
  function sh(t,src){const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){console.warn('shader',gl.getShaderInfoLog(s));return null;}return s;}
  function prog(vs,fs){const p=gl.createProgram();const a=sh(gl.VERTEX_SHADER,vs),b=sh(gl.FRAGMENT_SHADER,fs);
    if(!a||!b)return null; gl.attachShader(p,a);gl.attachShader(p,b);gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)){console.warn('link',gl.getProgramInfoLog(p));return null;}return p;}

  const CAM=`uniform float uYaw,uPitch,uZoom,uFocal,uCamC,uAspect;
    vec3 cam(vec3 a){ float cy=cos(uYaw),sy=sin(uYaw),cp=cos(uPitch),sp=sin(uPitch);
      vec3 q=vec3(a.x*cy+a.z*sy, a.y, -a.x*sy+a.z*cy);
      return vec3(q.x, q.y*cp-q.z*sp, q.y*sp+q.z*cp); }`;
  let P_PT=null,P_LN=null,P_POST=null;
  if(GLOK){
    P_PT=prog(
      CAM+`attribute vec3 aPos; attribute float aD; uniform float uPtBase,uPtZoomK,uSlabC,uSlabHT,uSlabOn,uSlabRadial; uniform vec3 uCenter;
      varying float vD,vFog,vSlab;
      void main(){
        // world-fixed thin slab along the z principal axis (slice mode); fade out near the slab faces
        float sd=(uSlabRadial>0.5)?(length(aPos-uCenter)-uSlabC):(aPos.z-uSlabC);
        if(uSlabOn>0.5 && abs(sd)>uSlabHT){ gl_Position=vec4(2.0,2.0,2.0,1.0); vD=aD; vFog=0.0; vSlab=0.0; return; }
        vSlab=1.0-uSlabOn*0.8*clamp(abs(sd)/uSlabHT,0.0,1.0);
        vec3 p=cam(aPos); float zc=p.z+uCamC; float pe=uFocal/max(zc,0.05);
        vec2 s=vec2(p.x*pe*uZoom/uAspect, p.y*pe*uZoom);
        float ndcZ=clamp((zc-1.0)/4.0,-1.0,1.0);
        gl_Position=(zc<0.12)?vec4(2.0,2.0,2.0,1.0):vec4(s,ndcZ,1.0);
        float zk=uPtZoomK*uZoom+(1.0-uPtZoomK);
        gl_PointSize=clamp(uPtBase*pe*zk*(0.5+aD),1.0,240.0);
        vD=aD; vFog=clamp((uCamC+1.55-zc)/2.95,0.05,1.0); }`,
      `precision mediump float; varying float vD,vFog,vSlab; uniform sampler2D uLUT; uniform float uMode;
      void main(){ vec2 q=gl_PointCoord*2.0-1.0; float r2=dot(q,q); if(r2>1.0) discard;
        float g=exp(-r2*2.5);
        if(uMode>2.5){ float dd=0.4+0.6*vD; float w=g*vFog*dd*dd*vSlab; gl_FragColor=vec4(w,w,w,w); return; } // HDR accumulate (w² sharpens contrast)
        vec3 c=texture2D(uLUT, vec2(clamp(0.12+0.88*vD,0.0,1.0),0.5)).rgb;
        float a; if(uMode<1.5) a=g*vFog*(0.45+0.55*vD); else a=g*vFog*(0.16+0.30*vD);
        gl_FragColor=vec4(c,a*vSlab); }`);
    P_LN=prog(
      CAM+`attribute vec3 aPos; attribute float aVal;
      uniform float uSlabC,uSlabHT,uSlabOn,uSlabRadial; uniform vec3 uCenter; varying float vVal,vFog,vSlab;
      void main(){
        float sd=(uSlabRadial>0.5)?(length(aPos-uCenter)-uSlabC):(aPos.z-uSlabC);
        vSlab=(uSlabOn>0.5)?(1.0-smoothstep(uSlabHT*0.5,uSlabHT,abs(sd))):1.0;
        vec3 p=cam(aPos); float zc=p.z+uCamC; float pe=uFocal/max(zc,0.05);
        vec2 s=vec2(p.x*pe*uZoom/uAspect, p.y*pe*uZoom);
        gl_Position=(zc<0.12)?vec4(2.0,2.0,2.0,1.0):vec4(s,0.0,1.0);
        vVal=aVal; vFog=clamp((uCamC+1.55-zc)/2.95,0.08,1.0); }`,
      `precision mediump float; varying float vVal,vFog,vSlab; uniform sampler2D uLUT; uniform float uLineA;
      void main(){ if(vSlab<=0.002) discard; vec3 c=texture2D(uLUT,vec2(clamp(vVal,0.0,1.0),0.5)).rgb; gl_FragColor=vec4(c,uLineA*vFog*vSlab); }`);
    P_POST=prog(
      `attribute vec2 aXY; varying vec2 vUV; void main(){ vUV=aXY*0.5+0.5; gl_Position=vec4(aXY,0.0,1.0); }`,
      `precision mediump float; varying vec2 vUV; uniform sampler2D uAcc,uLUT; uniform float uGain;
      void main(){ float I=texture2D(uAcc,vUV).r; float t=1.0-exp(-uGain*I);
        vec3 c=texture2D(uLUT, vec2(clamp(t,0.0,1.0),0.5)).rgb;
        gl_FragColor=vec4(c, clamp(t*1.25,0.0,1.0)); }`);
    GLOK=!!(P_PT&&P_LN&&P_POST);
  }

  let posB,dB,velB,velVB,shpB,shpVB,quadB,texI,texV,texW,texG,texP,texR,texB,ovPosB,ovDB;
  function buf(data){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);return b;}
  function tex(data){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,256,1,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
  // float framebuffer for HDR density accumulation
  let fbo,fboTex,fboW=0,fboH=0,fboType,FBO_OK=false;
  if(GLOK){
    posB=buf(posF); dB=buf(dF); velB=buf(velSeg); velVB=buf(velValF); shpB=buf(shpSeg); shpVB=buf(shpValF);
    if(hasOv){ ovPosB=buf(ovPosF); ovDB=buf(ovDF); }
    quadB=buf(new Float32Array([-1,-1, 1,-1, -1,1, 1,1]));
    texI=tex(INFERNO); texV=tex(VIRIDIS); texW=tex(WHISK); texG=tex(GOLD); texP=tex(PALE);
    texR=tex(REDS); texB=tex(BLUES);
    const extF=gl.getExtension('OES_texture_float'), extHF=gl.getExtension('OES_texture_half_float');
    fboType = extF?gl.FLOAT:(extHF?extHF.HALF_FLOAT_OES:gl.UNSIGNED_BYTE);
    fbo=gl.createFramebuffer(); fboTex=gl.createTexture();
    FBO_OK = (fboType!==gl.UNSIGNED_BYTE);   // HDR needs float/half; else use additive fallback
  }
  function ensureFBO(W,H){
    if(!FBO_OK) return false;
    if(fboW===W&&fboH===H) return true;
    gl.bindTexture(gl.TEXTURE_2D,fboTex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,W,H,0,gl.RGBA,fboType,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,fboTex,0);
    const ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    if(!ok){ FBO_OK=false; return false; }   // float FBO not renderable -> additive fallback
    fboW=W; fboH=H; return true;
  }

  /* ---------- camera state (SHARED across all modes so the view persists) ---------- */
  let yaw=0, pitch=0.18, zoom=1.9, autoYaw=0, dragging=false, lastT=0, idleSince=0;
  const FOCAL=1.85, CAMC=2.9;
  /* slice-mode slab: a thin world-fixed slab along the z principal axis. c=centre,
     ht=half-thickness (normalised units; ×SCALE_MPCH → Mpc/h). Manually scrubbed. */
  const SLAB={c:0.0, ht:0.055, cMin:-0.80, cMax:0.80, htMin:0.02, htMax:0.30};
  // radial slab: R = distance from the OBSERVER (Earth) — the centre of the CMASS
  // redshift spheres, recovered by a least-squares sphere fit to the cap positions.
  const ROBS=[-0.2544, 0.0175, 0.2593];   // observer position (normalised pos units)
  let _rmin=1e9,_rmax=0;
  for(let i=0;i<N;i++){ const x=posF[3*i]-ROBS[0],y=posF[3*i+1]-ROBS[1],z=posF[3*i+2]-ROBS[2];
    const r=Math.sqrt(x*x+y*y+z*z); if(r<_rmin)_rmin=r; if(r>_rmax)_rmax=r; }
  const SLABR={c:0.5*(_rmin+_rmax), ht:Math.max(0.02,(_rmax-_rmin)/12),
               cMin:_rmin, cMax:_rmax, htMin:0.012, htMax:0.22};
  const SLICE_MODES={slice:1, slicev:1, slices:1, rslice:1, rslicev:1, rslices:1};
  const isSlice=m=>!!SLICE_MODES[m];
  const slabOf=m=>(m==='rslice'||m==='rslicev'||m==='rslices')?{o:SLABR,radial:1.0}:{o:SLAB,radial:0.0};
  function setU(p,mode,W,H){
    gl.uniform1f(uloc(p,'uYaw'),autoYaw+yaw); gl.uniform1f(uloc(p,'uPitch'),pitch);
    gl.uniform1f(uloc(p,'uZoom'),zoom); gl.uniform1f(uloc(p,'uFocal'),FOCAL);
    gl.uniform1f(uloc(p,'uCamC'),CAMC); gl.uniform1f(uloc(p,'uAspect'),W/H);
    gl.uniform3f(uloc(p,'uCenter'),ROBS[0],ROBS[1],ROBS[2]);
  }
  function pointAttribs(p,pb,db){
    pb=pb||posB; db=db||dB;
    const aP=gl.getAttribLocation(p,'aPos'),aD=gl.getAttribLocation(p,'aD');
    gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.enableVertexAttribArray(aP);gl.vertexAttribPointer(aP,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,db);gl.enableVertexAttribArray(aD);gl.vertexAttribPointer(aD,1,gl.FLOAT,false,0,0);
  }
  function drawPoints(mode,texLUT,uMode,ptBase,W,H,depth,additive,ptZoomK,set){
    const _pb=set?set.posB:posB, _db=set?set.dB:dB, _n=set?set.N:N;
    gl.useProgram(P_PT); setU(P_PT,mode,W,H);
    gl.uniform1f(uloc(P_PT,'uPtBase'),ptBase); gl.uniform1f(uloc(P_PT,'uPtZoomK'),ptZoomK); gl.uniform1f(uloc(P_PT,'uMode'),uMode);
    const _sp=slabOf(mode), sOn=isSlice(mode)?1.0:0.0;
    gl.uniform1f(uloc(P_PT,'uSlabOn'),sOn); gl.uniform1f(uloc(P_PT,'uSlabC'),_sp.o.c);
    gl.uniform1f(uloc(P_PT,'uSlabHT'),_sp.o.ht); gl.uniform1f(uloc(P_PT,'uSlabRadial'),_sp.radial);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,texLUT); gl.uniform1i(uloc(P_PT,'uLUT'),0);
    pointAttribs(P_PT,_pb,_db);
    if(depth){gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);}else gl.disable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, additive?gl.ONE:gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS,0,_n);
  }
  function drawLines(mode,pb,vb,nv,texLUT,W,H,lineA){
    gl.useProgram(P_LN); setU(P_LN,mode,W,H);
    gl.uniform1f(uloc(P_LN,'uLineA'), lineA===undefined?0.7:lineA);
    const _sl=slabOf(mode), _sOn=isSlice(mode)?1.0:0.0;
    gl.uniform1f(uloc(P_LN,'uSlabOn'),_sOn); gl.uniform1f(uloc(P_LN,'uSlabC'),_sl.o.c);
    gl.uniform1f(uloc(P_LN,'uSlabHT'),_sl.o.ht); gl.uniform1f(uloc(P_LN,'uSlabRadial'),_sl.radial);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,texLUT); gl.uniform1i(uloc(P_LN,'uLUT'),0);
    const aP=gl.getAttribLocation(P_LN,'aPos'),aV=gl.getAttribLocation(P_LN,'aVal');
    gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.enableVertexAttribArray(aP);gl.vertexAttribPointer(aP,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.enableVertexAttribArray(aV);gl.vertexAttribPointer(aV,1,gl.FLOAT,false,0,0);
    gl.disable(gl.DEPTH_TEST); gl.blendFunc(gl.SRC_ALPHA,gl.ONE); gl.drawArrays(gl.LINES,0,nv);
  }
  function drawDensity(W,H){
    if(ensureFBO(W,H)){
      gl.bindFramebuffer(gl.FRAMEBUFFER,fbo); gl.viewport(0,0,W,H);
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(P_PT); setU(P_PT,'density',W,H);
      gl.uniform1f(uloc(P_PT,'uPtBase'),22.0); gl.uniform1f(uloc(P_PT,'uPtZoomK'),0.0); gl.uniform1f(uloc(P_PT,'uMode'),3.0);
      gl.uniform1f(uloc(P_PT,'uSlabOn'),0.0); gl.uniform1f(uloc(P_PT,'uSlabHT'),9.0); gl.uniform1f(uloc(P_PT,'uSlabRadial'),0.0);
      pointAttribs(P_PT);
      gl.disable(gl.DEPTH_TEST); gl.blendFunc(gl.ONE,gl.ONE); gl.drawArrays(gl.POINTS,0,N);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,W,H);
      gl.clearColor(0.039,0.031,0.070,1.0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(P_POST);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,fboTex); gl.uniform1i(uloc(P_POST,'uAcc'),0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,texI); gl.uniform1i(uloc(P_POST,'uLUT'),1);
      // auto-exposure: pile-up scales with zoom, so does the gain (tuned for the NGC cap)
      gl.uniform1f(uloc(P_POST,'uGain'), 0.007*Math.pow(zoom,1.8));
      const aXY=gl.getAttribLocation(P_POST,'aXY');
      gl.bindBuffer(gl.ARRAY_BUFFER,quadB); gl.enableVertexAttribArray(aXY); gl.vertexAttribPointer(aXY,2,gl.FLOAT,false,0,0);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA); gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    } else {
      drawPoints('density',texI,1.0,18.0,W,H,false,true,0.0);  // fallback: simple additive
    }
  }
  function renderGL(mode,W,H,scheme){
    const galTex = scheme==='red'?texR : (scheme==='blue'?texB : texV);
    const navy=(mode==='flow');
    gl.viewport(0,0,W,H);
    gl.clearColor(navy?0.016:0.039, navy?0.024:0.031, navy?0.060:0.070, 1.0); gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT); gl.enable(gl.BLEND);
    if(mode==='density'){ drawDensity(W,H); }
    else if(mode==='galaxies'){ drawPoints(mode,galTex,1.0,2.8,W,H,true,false,0.0);
      if(hasOv) drawPoints(mode,texB,1.0,2.8,W,H,true,false,0.0,{posB:ovPosB,dB:ovDB,N:ovN}); }
    else if(mode==='slice'){ drawPoints(mode,texV,1.0,4.2,W,H,true,false,0.0); }  // thin slab of galaxies — the web revealed
    else if(mode==='rslice'){ drawPoints(mode,texV,1.0,4.2,W,H,true,false,0.0); }  // radial shell of galaxies (R slices)
    else if(mode==='slicev'){ drawPoints(mode,texV,2.0,1.5,W,H,true,false,0.0); drawLines(mode,velB,velVB,NV_VEL,texI,W,H,0.85); }
    else if(mode==='slices'){ drawPoints(mode,texV,2.0,1.5,W,H,true,false,0.0); drawLines(mode,shpB,shpVB,NV_SHP,texW,W,H,0.85); }
    else if(mode==='rslicev'){ drawPoints(mode,texV,2.0,1.5,W,H,true,false,0.0); drawLines(mode,velB,velVB,NV_VEL,texI,W,H,0.85); }
    else if(mode==='rslices'){ drawPoints(mode,texV,2.0,1.5,W,H,true,false,0.0); drawLines(mode,shpB,shpVB,NV_SHP,texW,W,H,0.85); }
    else if(mode==='velocity'){ drawPoints(mode,texV,2.0,1.5,W,H,true,false,0.0); drawLines(mode,velB,velVB,NV_VEL,texI,W,H,0.7); }
    else if(mode==='shapes'){ drawPoints(mode,texV,2.0,1.5,W,H,true,false,0.0); drawLines(mode,shpB,shpVB,NV_SHP,texW,W,H,0.7); }
    else if(mode==='flow'){  // Laniakea-style: faint galaxy specks + glowing gold flow streamlines
      drawPoints(mode,texP,2.0,1.2,W,H,true,false,0.0);
      drawLines(mode,velB,velVB,NV_VEL,texG,W,H,0.30); }
    gl.flush();
  }

  /* ---------- canvas2D fallback (no WebGL) ---------- */
  function fallback(canvas,mode,W,H){
    const ctx=canvas.getContext('2d'); ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle='#0a0812'; ctx.fillRect(0,0,W,H);
    const cy=Math.cos(autoYaw),sy=Math.sin(autoYaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const z=zoom, asp=W/H, step=Math.max(1,(N/14000)|0);
    const sliceZ=(mode==='slice'||mode==='slicev'||mode==='slices'), sliceR=(mode==='rslice'||mode==='rslicev'||mode==='rslices');
    for(let i=0;i<N;i+=step){
      const ax_=posF[3*i],ay_=posF[3*i+1],az_=posF[3*i+2];
      if(sliceZ && Math.abs(az_-SLAB.c)>SLAB.ht) continue;   // thin z-slab cull
      if(sliceR){ const _dx=ax_-ROBS[0],_dy=ay_-ROBS[1],_dz=az_-ROBS[2],_r=Math.sqrt(_dx*_dx+_dy*_dy+_dz*_dz); if(Math.abs(_r-SLABR.c)>SLABR.ht) continue; }
      const x1=ax_*cy+az_*sy, z1=-ax_*sy+az_*cy, y2=ay_*cp-z1*sp, z2=ay_*sp+z1*cp, zc=z2+CAMC; if(zc<0.15) continue;
      const pe=FOCAL/zc, sx=((x1*pe*z/asp)*0.5+0.5)*W, syy=(0.5-(y2*pe*z)*0.5)*H;
      ctx.fillStyle='rgba(120,200,170,'+(0.5*dF[i]+0.1).toFixed(2)+')'; ctx.fillRect(sx,syy,1.5,1.5);
    }
  }

  /* ---------- scale stick (auto-sizing comoving bar, top-right) ---------- */
  function niceLen(target){ const opts=[10,20,50,100,200,500,1000,2000,5000];
    let best=opts[0],bd=1e18; for(const o of opts){const d=Math.abs(o-target); if(d<bd){bd=d;best=o;}} return best; }
  function drawScaleBar(ctx,W,H){
    const k=(FOCAL/CAMC)*zoom*0.5*H;               // device px per scaled unit at cap centre
    const L=niceLen(0.16*W/Math.max(k,1e-6)*SCALE_MPCH);
    const barPx=L/SCALE_MPCH*k; if(!isFinite(barPx)||barPx<8) return;
    const m=26*DPR, x1=W-m, x0=x1-barPx, y=m+16*DPR;
    ctx.save(); ctx.setTransform(1,0,0,1,0,0);
    ctx.shadowColor='rgba(0,0,0,0.85)'; ctx.shadowBlur=6*DPR;
    ctx.strokeStyle='rgba(246,241,231,0.92)'; ctx.lineWidth=Math.max(1,2*DPR);
    ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y);
    ctx.moveTo(x0,y-5*DPR); ctx.lineTo(x0,y+5*DPR); ctx.moveTo(x1,y-5*DPR); ctx.lineTo(x1,y+5*DPR);
    ctx.stroke();
    ctx.fillStyle='rgba(246,241,231,0.96)'; ctx.font='600 '+((12*DPR)|0)+'px -apple-system,Helvetica,Arial,sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText(L>=1000?(L/1000)+' Gpc/h':L+' Mpc/h',(x0+x1)/2,y-7*DPR);
    ctx.restore();
  }

  /* ---------- slice-mode slab readout + depth gauge (top-left) ---------- */
  function drawSlabBar(ctx,W,H,mode){
    const radial=(mode==='rslice'||mode==='rslicev'||mode==='rslices'); const S=radial?SLABR:SLAB;
    ctx.save(); ctx.setTransform(1,0,0,1,0,0);
    const thick=Math.round(2*S.ht*SCALE_MPCH), off=Math.round(S.c*SCALE_MPCH);
    const m=26*DPR, x=m, y=m+14*DPR;
    ctx.shadowColor='rgba(0,0,0,0.85)'; ctx.shadowBlur=6*DPR;
    ctx.fillStyle='rgba(246,241,231,0.96)'; ctx.font='600 '+((12*DPR)|0)+'px -apple-system,Helvetica,Arial,sans-serif';
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    ctx.fillText(radial ? ('R \u2248 '+off+' Mpc/h  \u00b7  shell '+thick+' Mpc/h')
                        : ('slab '+thick+' Mpc/h  \u00b7  depth '+(off>=0?'+':'')+off+' Mpc/h'), x, y);
    const tw=190*DPR, ty=y+9*DPR, span=S.cMax-S.cMin;
    ctx.shadowBlur=0; ctx.strokeStyle='rgba(246,241,231,0.35)'; ctx.lineWidth=Math.max(1,DPR);
    ctx.beginPath(); ctx.moveTo(x,ty); ctx.lineTo(x+tw,ty); ctx.stroke();
    const cx=x+((S.c-S.cMin)/span)*tw, hw=Math.max(2*DPR,(S.ht/span)*tw);
    ctx.fillStyle='rgba(232,176,122,0.92)'; ctx.fillRect(cx-hw, ty-3*DPR, hw*2, 6*DPR);
    ctx.fillStyle='rgba(246,241,231,0.55)'; ctx.font='500 '+((10*DPR)|0)+'px -apple-system,Helvetica,Arial,sans-serif';
    ctx.fillText((radial?'\u2191/\u2193 or shift+scroll: R':'\u2191/\u2193 or shift+scroll: depth')+'   \u00b7   [ / ]: thickness', x, ty+15*DPR);
    ctx.restore();
  }

  /* ---------- flow-direction arrowheads (velocity slide) ----------
     streamline segments are stored downstream-ordered (vertex0 -> vertex1 points
     along the flow), so we project a subset and draw a "V" arrowhead at the tip. */
  const _a0={x:0,y:0,zc:0}, _a1={x:0,y:0,zc:0};
  function projPt(x,y,z,W,H,o){
    const ye=autoYaw+yaw, cy=Math.cos(ye),sy=Math.sin(ye),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const x1=x*cy+z*sy, z1=-x*sy+z*cy, y1=y;
    const y2=y1*cp-z1*sp, z2=y1*sp+z1*cp, zc=z2+CAMC;
    if(zc<0.12) return false;
    const pe=FOCAL/Math.max(zc,0.05), asp=W/H;
    o.x=((x1*pe*zoom/asp)*0.5+0.5)*W; o.y=(0.5-(y2*pe*zoom)*0.5)*H; o.zc=zc; return true;
  }
  function drawVelArrows(ctx,W,H,mode){
    const nSeg=NV_VEL/2, stride=Math.max(1,(nSeg/420)|0), hl=7*DPR;
    const cullZ=(mode==='slicev'), cullR=(mode==='rslicev');
    ctx.save(); ctx.setTransform(1,0,0,1,0,0);
    ctx.strokeStyle='rgba(255,226,176,0.92)'; ctx.lineWidth=Math.max(1,1.4*DPR);
    ctx.shadowColor='rgba(0,0,0,0.65)'; ctx.shadowBlur=2*DPR; ctx.beginPath();
    for(let s=0;s<nSeg;s+=stride){
      const o0=6*s, o1=6*s+3;
      if(cullZ && Math.abs(velSeg[o0+2]-SLAB.c)>SLAB.ht) continue;
      if(cullR){ const _x=velSeg[o0]-ROBS[0],_y=velSeg[o0+1]-ROBS[1],_z=velSeg[o0+2]-ROBS[2]; if(Math.abs(Math.sqrt(_x*_x+_y*_y+_z*_z)-SLABR.c)>SLABR.ht) continue; }
      if(!projPt(velSeg[o0],velSeg[o0+1],velSeg[o0+2],W,H,_a0)) continue;
      if(!projPt(velSeg[o1],velSeg[o1+1],velSeg[o1+2],W,H,_a1)) continue;
      const dx=_a1.x-_a0.x, dy=_a1.y-_a0.y, L=Math.hypot(dx,dy); if(L<3) continue;
      if(_a1.x<-10||_a1.x>W+10||_a1.y<-10||_a1.y>H+10) continue;
      const a=Math.atan2(dy,dx);
      ctx.moveTo(_a1.x,_a1.y); ctx.lineTo(_a1.x-hl*Math.cos(a-0.5),_a1.y-hl*Math.sin(a-0.5));
      ctx.moveTo(_a1.x,_a1.y); ctx.lineTo(_a1.x-hl*Math.cos(a+0.5),_a1.y-hl*Math.sin(a+0.5));
    }
    ctx.stroke(); ctx.restore();
  }

  /* ---------- drive: blit onto active field canvas ---------- */
  const DPR=Math.min(window.devicePixelRatio||1,1.5);
  function activeFieldCanvas(){ const a=document.querySelector('.reveal .slides > section.present'); if(!a) return null;
    const cs=a.querySelectorAll('canvas.webcanvas');           // a slide may hold >1 (CMASS+BGS side by side)
    for(let i=0;i<cs.length;i++){ if((cs[i].dataset.src||'')===SRC) return cs[i]; }
    return null; }
  function loop(t){
    if(!lastT) lastT=t; const dt=Math.min(64,t-lastT); lastT=t;
    // auto-orbit disabled — the view is static until the user drags / scrolls
    const c=activeFieldCanvas();
    if(c){ const rect=c.getBoundingClientRect();
      if(rect.width>2&&rect.height>2){
        const W=Math.round(rect.width*DPR), H=Math.round(rect.height*DPR);
        if(c.width!==W||c.height!==H){c.width=W;c.height=H;}
        const mode=c.dataset.mode;
        if(GLOK){ if(glc.width!==W||glc.height!==H){glc.width=W;glc.height=H;}
          try{ renderGL(mode,W,H,c.dataset.scheme||''); const ctx=c.getContext('2d'); ctx.setTransform(1,0,0,1,0,0);
            ctx.clearRect(0,0,W,H); ctx.drawImage(glc,0,0);
            if(mode==='velocity'||mode==='flow'||mode==='slicev'||mode==='rslicev') drawVelArrows(ctx,W,H,mode);
            drawScaleBar(ctx,W,H); if(isSlice(mode)) drawSlabBar(ctx,W,H,mode); }
          catch(e){ GLOK=false; }
        } else { fallback(c,mode,W,H); const fx=c.getContext('2d'); drawScaleBar(fx,W,H); if(isSlice(mode)) drawSlabBar(fx,W,H,mode); }
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* ---------- interaction ---------- */
  function nowMs(){ return (window.performance&&performance.now)?performance.now():Date.now(); }
  function onWheel(e){ const c=activeFieldCanvas(); if(!c) return; e.preventDefault();
    if(isSlice(c.dataset.mode) && e.shiftKey){   // shift+scroll scrubs the slab through depth/R (scroll alone still zooms)
      const S=slabOf(c.dataset.mode).o;
      S.c=Math.max(S.cMin,Math.min(S.cMax, S.c+e.deltaY*0.0007*(S.cMax-S.cMin))); idleSince=nowMs(); return; }
    zoom=Math.max(0.4,Math.min(16, zoom*Math.exp(-e.deltaY*0.0015))); idleSince=nowMs(); }
  // manual depth/thickness scrub via keys — only when the active slide is the slice view.
  function onKey(e){ const c=activeFieldCanvas(); if(!c||!isSlice(c.dataset.mode)) return;
    const S=slabOf(c.dataset.mode).o, dc=(S.cMax-S.cMin)*0.04, dh=(S.htMax-S.htMin)*0.07;
    let used=true;
    switch(e.key){
      case 'ArrowUp':   S.c=Math.min(S.cMax, S.c+dc); break;
      case 'ArrowDown': S.c=Math.max(S.cMin, S.c-dc); break;
      case ']':         S.ht=Math.min(S.htMax, S.ht+dh); break;
      case '[':         S.ht=Math.max(S.htMin, S.ht-dh); break;
      default: used=false;
    }
    if(used){ e.preventDefault(); e.stopPropagation(); idleSince=nowMs(); } }
  let px=0,py=0,moved=0;
  function onDown(e){ if(!activeFieldCanvas())return; dragging=true; moved=0; px=e.clientX; py=e.clientY; }
  function onMove(e){ if(!dragging)return; const dx=e.clientX-px,dy=e.clientY-py; px=e.clientX; py=e.clientY;
    moved+=Math.abs(dx)+Math.abs(dy); yaw+=dx*0.006; pitch=Math.max(-1.2,Math.min(1.2,pitch+dy*0.006)); }
  function onUp(){ if(dragging){ dragging=false; idleSince=nowMs(); } }
  function bind(){
    document.querySelectorAll('canvas.webcanvas').forEach(c=>{
      if((c.dataset.src||'')!==SRC) return;
      c.addEventListener('wheel',onWheel,{passive:false});
      c.addEventListener('pointerdown',onDown);
      c.addEventListener('click',e=>{ if(moved>6){e.stopPropagation();e.preventDefault();} },true);
    });
    window.addEventListener('pointermove',onMove); window.addEventListener('pointerup',onUp);
    window.addEventListener('keydown',onKey,true);   // capture: handle slab keys before the deck's nav handler
  }
  if(document.readyState!=='loading') bind(); else document.addEventListener('DOMContentLoaded',bind);
  if(!GLOK) console.warn('[orbit] WebGL unavailable — canvas2D fallback.');
 }
 makeOrbit(window.WEB_DATA, '');
 if(window.WEB_DATA_BGS) makeOrbit(window.WEB_DATA_BGS, 'bgs');
 if(window.WEB_DATA_BOTH) makeOrbit(window.WEB_DATA_BOTH, 'both');   // CMASS(red)+BGS(blue) overlaid
 // trio slide: three independent CMASS engines, one per field (galaxies | velocity | shapes)
 if(document.querySelector('canvas[data-src="trio-gal"]')) makeOrbit(window.WEB_DATA, 'trio-gal');
 if(document.querySelector('canvas[data-src="trio-vel"]')) makeOrbit(window.WEB_DATA, 'trio-vel');
 if(document.querySelector('canvas[data-src="trio-shp"]')) makeOrbit(window.WEB_DATA, 'trio-shp');
})();
