/*
 * env.js - lucht (zon, maan, sterren, wolken), dag/nacht-cyclus, licht, schaduwen,
 * omgevingsreflecties (PMREM) en het water. Plus een hulpfunctie om standaard
 * PBR-materialen uit te breiden met wereldcoordinaten in de shader.
 */
(function () {
  'use strict';

  var G = window.G, T = G.T, U = G.U;
  var E = G.env = {};

  var NOISE_GLSL = [
    'float owHash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }',
    'float owNoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);',
    '  return mix(mix(owHash(i),owHash(i+vec2(1.0,0.0)),f.x), mix(owHash(i+vec2(0.0,1.0)),owHash(i+vec2(1.0,1.0)),f.x), f.y); }',
    'float owFbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<5;i++){ v+=a*owNoise(p); p*=2.03; a*=0.5; } return v; }',
    ''
  ].join('\n');
  G.NOISE_GLSL = NOISE_GLSL;

  var WORLD_VS = [
    '#ifdef USE_INSTANCING',
    '  vec4 owW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);',
    '  vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);',
    '#else',
    '  vec4 owW = modelMatrix * vec4(transformed, 1.0);',
    '  vWN = normalize(mat3(modelMatrix) * objectNormal);',
    '#endif',
    '  vWP = owW.xyz;'
  ].join('\n');

  // Breidt een MeshStandardMaterial uit met wereldpositie (vWP) en -normaal (vWN).
  // opts.color: code na color_fragment; opts.rough: na metalnessmap_fragment;
  // opts.emissive: na emissivemap_fragment; opts.normal: na normal_fragment_maps.
  G.patchWorld = function (mat, opts) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = G.uniforms.uTime;
      sh.uniforms.uNight = G.uniforms.uNight;
      sh.uniforms.uSunDir = G.uniforms.uSunDir;
      if (opts.uniforms) for (var k in opts.uniforms) sh.uniforms[k] = opts.uniforms[k];
      sh.vertexShader = 'varying vec3 vWP;\nvarying vec3 vWN;\n' + (opts.vhead || '') +
        sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + WORLD_VS + '\n' + (opts.vmain || ''));
      var head = 'varying vec3 vWP;\nvarying vec3 vWN;\nuniform float uTime;\nuniform float uNight;\nuniform vec3 uSunDir;\n' +
        NOISE_GLSL + (opts.head || '');
      var fs = head + sh.fragmentShader;
      if (opts.color) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + opts.color);
      if (opts.rough) fs = fs.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + opts.rough);
      if (opts.emissive) fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + opts.emissive);
      if (opts.normal) fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + opts.normal);
      sh.fragmentShader = fs;
    };
    mat.customProgramCacheKey = function () { return 'ow_' + opts.key; };
    return mat;
  };

  // ---- Lucht ----------------------------------------------------------------
  var SKY_VS = [
    'varying vec3 vPos;',
    'void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
  ].join('\n');

  var SKY_FS = [
    'uniform vec3 uSunDir; uniform float uNight; uniform float uTime;',
    'varying vec3 vPos;',
    NOISE_GLSL,
    'float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }',
    'void main(){',
    '  vec3 d = normalize(vPos);',
    '  float h = d.y;',
    '  float sunH = uSunDir.y;',
    '  float sunset = smoothstep(0.45, 0.0, abs(sunH));',
    '  vec3 zen = mix(mix(vec3(0.16,0.38,0.82), vec3(0.22,0.25,0.55), sunset), vec3(0.008,0.012,0.035), uNight);',
    '  vec3 hor = mix(mix(vec3(0.62,0.8,0.97), vec3(1.0,0.52,0.25), sunset), vec3(0.03,0.05,0.1), uNight);',
    '  vec3 col = mix(hor, zen, pow(max(h, 0.0), 0.45));',
    '  if (h < 0.0) col = mix(hor, hor * 0.5, min(1.0, -h * 3.0));',
    '  float sd = max(dot(d, uSunDir), 0.0);',
    '  col += vec3(1.0,0.75,0.45) * pow(sd, 6.0) * 0.45 * (1.0 - uNight) * (0.4 + sunset);',
    '  col += vec3(1.0,0.95,0.85) * smoothstep(0.9993, 0.9997, sd) * 30.0 * step(-0.02, d.y) * (1.0 - uNight * 0.95);',
    '  float md = max(dot(d, -uSunDir), 0.0);',
    '  col += vec3(0.85,0.9,1.0) * smoothstep(0.9994, 0.9997, md) * 4.0 * uNight;',
    '  col += vec3(0.4,0.5,0.8) * pow(md, 40.0) * 0.3 * uNight;',
    '  if (h > 0.0) {',
    '    vec3 sp = floor(d * 380.0);',
    '    float s = h3(sp);',
    '    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 50.0);',
    '    col += vec3(1.0) * step(0.9975, s) * uNight * smoothstep(0.0, 0.3, h) * 2.2 * tw;',
    '    vec2 cp = d.xz / (h + 0.12) * 1.3 + vec2(uTime * 0.006, uTime * 0.003);',
    '    float c = owFbm(cp);',
    '    c = smoothstep(0.48, 0.82, c) * smoothstep(0.0, 0.25, h);',
    '    vec3 cc = mix(mix(vec3(1.0), vec3(1.0,0.66,0.48), sunset), vec3(0.06,0.07,0.1), uNight);',
    '    col = mix(col, cc * (0.75 + 0.35 * sd), c * 0.8);',
    '  }',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  function skyMaterial() {
    return new T.ShaderMaterial({
      uniforms: { uSunDir: G.uniforms.uSunDir, uNight: G.uniforms.uNight, uTime: G.uniforms.uTime },
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      side: T.BackSide,
      depthWrite: false,
      fog: false
    });
  }

  var sky, envScene, pmrem, envRT, sun, hemi, water, scene, renderer;
  var lastEnvTime = -999, lastEnvReal = 0;
  var tmp = new T.Vector3();
  var NIGHT_FOG = new T.Color(0.03, 0.045, 0.09);

  E.create = function (sc, rend, quality) {
    scene = sc;
    renderer = rend;
    scene.fog = new T.FogExp2(0x9fc8e8, 0.0011);

    hemi = new T.HemisphereLight(0xcfe6ff, 0x5a5040, 0.7);
    scene.add(hemi);

    sun = new T.DirectionalLight(0xffffff, 2.4);
    sun.castShadow = quality !== 'laag';
    var res = quality === 'ultra' ? 4096 : 2048;
    sun.shadow.mapSize.set(res, res);
    var S = quality === 'ultra' ? 90 : 70;
    sun.shadow.camera.left = -S;
    sun.shadow.camera.right = S;
    sun.shadow.camera.top = S;
    sun.shadow.camera.bottom = -S;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 600;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    scene.add(sun);
    scene.add(sun.target);
    E.sun = sun;
    E.hemi = hemi;

    sky = new T.Mesh(new T.SphereGeometry(1900, 48, 24), skyMaterial());
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    scene.add(sky);

    envScene = new T.Scene();
    envScene.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), skyMaterial()));
    pmrem = new T.PMREMGenerator(renderer);

    // Water: spiegelend PBR-materiaal met golvende normalen
    var wm = new T.MeshStandardMaterial({ color: 0x0f3a52, roughness: 0.05, metalness: 0.1 });
    G.patchWorld(wm, {
      key: 'water',
      normal: [
        'vec2 wp = vWP.xz;',
        'float t = uTime;',
        'float gx = cos(wp.x*0.21 + t*1.3)*0.08 + cos(wp.x*0.53 + wp.y*0.31 + t*2.1)*0.05 + cos(wp.x*1.7 - wp.y*0.9 + t*3.4)*0.025;',
        'float gz = cos(wp.y*0.17 + t*1.1)*0.08 + cos(wp.y*0.61 - wp.x*0.27 + t*1.8)*0.05 + cos(wp.y*1.9 + wp.x*1.1 + t*3.0)*0.025;',
        'gx += (owNoise(wp*0.8 + t*0.6) - 0.5) * 0.06; gz += (owNoise(wp*0.8 - t*0.5 + 7.0) - 0.5) * 0.06;',
        'normal = normalize(normal + (viewMatrix * vec4(-gx, 0.0, -gz, 0.0)).xyz);'
      ].join('\n'),
      color: [
        'float depthTint = smoothstep(700.0, 820.0, vWP.z);',
        'diffuseColor.rgb = mix(vec3(0.05,0.33,0.36), diffuseColor.rgb, depthTint);'
      ].join('\n')
    });
    water = new T.Mesh(new T.PlaneGeometry(6000, 6000, 1, 1), wm);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.45, 0);
    water.receiveShadow = true;
    scene.add(water);
    E.WATER_Y = -0.45;
    E.update(0, new T.Vector3(), null, true);
  };

  E.dayFraction = function () { return (G.state.time % 1440) / 1440; };

  E.isNight = function () { return G.uniforms.uNight.value > 0.5; };

  E.update = function (dt, focus, camera, forceEnv) {
    var frac = E.dayFraction();
    var ang = (frac - 0.25) * Math.PI * 2;          // 06:00 = horizon, 12:00 = hoogste punt
    var sd = G.uniforms.uSunDir.value;
    sd.set(Math.cos(ang) * 0.75, Math.sin(ang), Math.cos(ang) * 0.35 + 0.35).normalize();
    var elev = sd.y;
    var night = U.smooth(0.08, -0.12, elev);
    G.uniforms.uNight.value = night;

    var sunset = U.smooth(0.4, 0.0, Math.abs(elev));
    var day = 1 - night;
    // Zon (overdag) of maan ('s nachts) als hoofdlicht
    var lightDir = elev > -0.05 ? sd : tmp.copy(sd).multiplyScalar(-1);
    sun.intensity = day * (2.6 - sunset * 1.2) + night * 0.35;
    sun.color.setRGB(1, 0.92 - sunset * 0.3, 0.85 - sunset * 0.45);
    if (night > 0.5) sun.color.setRGB(0.6, 0.7, 1.0);
    hemi.intensity = 0.25 + day * 0.55;
    hemi.color.setRGB(0.55 + day * 0.25, 0.65 + day * 0.25, 0.85 + day * 0.15);
    hemi.groundColor.setRGB(0.25 * day + 0.05, 0.22 * day + 0.05, 0.18 * day + 0.08);

    var fc = scene.fog.color;
    fc.setRGB(0.6 - sunset * 0.05, 0.75 - sunset * 0.2, 0.92 - sunset * 0.4);
    fc.lerp(NIGHT_FOG, night);

    if (focus) {
      // Schaduwcamera volgt de speler en klikt op texels vast (minder flikkeren)
      var step = 0.5;
      var fx = Math.round(focus.x / step) * step;
      var fz = Math.round(focus.z / step) * step;
      sun.target.position.set(fx, 0, fz);
      sun.position.set(fx + lightDir.x * 250, Math.max(20, lightDir.y * 250), fz + lightDir.z * 250);
      sun.target.updateMatrixWorld();
    }
    if (camera) sky.position.copy(camera.position);

    var now = performance.now();
    if (forceEnv || (Math.abs(G.state.time - lastEnvTime) > 12 && now - lastEnvReal > 4000)) {
      lastEnvTime = G.state.time;
      lastEnvReal = now;
      var rt = pmrem.fromScene(envScene, 0.02);
      if (envRT) envRT.dispose();
      envRT = rt;
      scene.environment = rt.texture;
    }
  };
})();
