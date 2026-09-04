import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Textures are imported (not referenced by a literal /assets/ path) so Vite
// emits them with a content hash in the filename. Changing a texture changes
// its URL, which makes a stale browser cache structurally impossible.
//
// This is not theoretical: the textures were briefly published at 2048x1024
// and then restored to 4096x2048 under the SAME /assets/ URL, so browsers that
// had seen the site in between kept serving the low-resolution copy for the
// full `max-age=14400` window. Content-hashed URLs remove that whole class of bug.
import albedoFull    from '../assets/textures/earth_albedo.jpg?url';
import nightFull     from '../assets/textures/earth_night.jpg?url';
import cloudsFull    from '../assets/textures/earth_clouds.jpg?url';
import normalFull    from '../assets/textures/earth_normal.jpg?url';
import specularFull  from '../assets/textures/earth_specular.jpg?url';

import albedoLow     from '../assets/textures/lowres/earth_albedo.jpg?url';
import nightLow      from '../assets/textures/lowres/earth_night.jpg?url';
import cloudsLow     from '../assets/textures/lowres/earth_clouds.jpg?url';
import normalLow     from '../assets/textures/lowres/earth_normal.jpg?url';
import specularLow   from '../assets/textures/lowres/earth_specular.jpg?url';

// Ensure required data is available
if (typeof locationsData === 'undefined' || typeof flightRoutesData === 'undefined') {
    console.error('Required data is not defined. Make sure locationsData and flightRoutesData are passed correctly from Jekyll.');
} else {
    initEarth();
}

// Helper function to find location data by name
function findLocationByName(name) {
    return locationsData.find(loc => loc.name === name);
}

// Helper function to count route frequencies
function countRouteFrequencies(routes) {
    const frequencies = {};
    routes.forEach(route => {
        const cities = [route.origin, route.destination].sort();
        const routeKey = `${cities[0]}-${cities[1]}`;
        frequencies[routeKey] = (frequencies[routeKey] || 0) + 1;
    });
    return frequencies;
}

// Function to get route frequency
function getRouteFrequency(origin, destination, frequencies) {
    const cities = [origin, destination].sort();
    const routeKey = `${cities[0]}-${cities[1]}`;
    return frequencies[routeKey] || 1;
}

// Function to create curved flight path using great circle
function createFlightPath(startPoint, endPoint, earthRadius, numLines = 1) {
    const pathsPoints = [];
    const numPoints = 50;

    const startNormalized = startPoint.clone().normalize();
    const endNormalized = endPoint.clone().normalize();

    const dotProduct = startNormalized.dot(endNormalized);
    const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));

    const distance = startPoint.distanceTo(endPoint);
    const maxHeightScale = 0.08;
    const baseScale = Math.atan(distance) / (Math.PI / 2) * maxHeightScale;

    const basePoints = [];
    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const sinAngle = Math.sin(angle);
        if (sinAngle === 0) {
            const point = startNormalized.clone().lerp(endNormalized, t);
            const heightScale = earthRadius * (1 + baseScale * Math.sin(Math.PI * t));
            point.normalize().multiplyScalar(heightScale);
            basePoints.push(point);
        } else {
            const sinT = Math.sin(t * angle);
            const sinOneMinusT = Math.sin((1 - t) * angle);
            const point = new THREE.Vector3();
            point.addScaledVector(startNormalized, sinOneMinusT / sinAngle);
            point.addScaledVector(endNormalized, sinT / sinAngle);
            const heightScale = earthRadius * (1 + baseScale * Math.sin(Math.PI * t));
            point.normalize().multiplyScalar(heightScale);
            basePoints.push(point);
        }
    }

    const pathDirection = endPoint.clone().sub(startPoint).normalize();
    const globeNormal = startPoint.clone().add(endPoint).normalize();
    const perpDirection = pathDirection.clone().cross(globeNormal).normalize();

    for (let i = 0; i < numLines; i++) {
        const offset = perpDirection.clone().multiplyScalar(0.01 * (i - (numLines - 1) / 2));
        const offsetPoints = basePoints.map(point => point.clone().add(offset));
        pathsPoints.push(offsetPoints);
    }

    return pathsPoints;
}

// Used only for planned (dashed) flights — completed flights use merged geometry
function createFlightLines(pathsPoints, color = 0x00ff00, isPlanned = false) {
    const lines = [];
    const dashSize = 0.15;
    const gapSize = 0.08;

    pathsPoints.forEach(points => {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const brightColor = new THREE.Color(color).multiplyScalar(1.5);

        const material = isPlanned
            ? new THREE.LineDashedMaterial({ color: brightColor, dashSize, gapSize, depthTest: true, depthWrite: true })
            : new THREE.LineBasicMaterial({ color: brightColor, depthTest: true, depthWrite: true });

        const line = new THREE.Line(geometry, material);
        if (isPlanned) line.computeLineDistances();
        line.renderOrder = 1;

        const glowGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const glowMaterial = isPlanned
            ? new THREE.LineDashedMaterial({ color: brightColor, transparent: true, opacity: 0.4, dashSize, gapSize, depthTest: true, depthWrite: false })
            : new THREE.LineBasicMaterial({ color: brightColor, transparent: true, opacity: 0.4, depthTest: true, depthWrite: false });
        const glowLine = new THREE.Line(glowGeometry, glowMaterial);
        if (isPlanned) glowLine.computeLineDistances();
        glowLine.renderOrder = 0;

        lines.push(glowLine);
        lines.push(line);
    });
    return lines;
}

function getUniqueValues(data, key) {
    if (key === 'travelers') {
        const allTravelers = new Set();
        data.forEach(item => {
            if (Array.isArray(item[key])) item[key].forEach(t => allTravelers.add(t));
        });
        return [...allTravelers].sort();
    }
    return [...new Set(data.map(item => item[key]))].filter(Boolean).sort();
}

function populateFilterDropdowns(flightData) {
    const years = getUniqueValues(flightData, 'year');
    const airlines = getUniqueValues(flightData, 'airline');
    const occasions = getUniqueValues(flightData, 'occasion');
    const months = getUniqueValues(flightData, 'month');
    const travelers = getUniqueValues(flightData, 'travelers');

    function populateDropdown(elementId, values) {
        const select = document.getElementById(elementId);
        if (!select) return;
        select.innerHTML = '';
        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
    }

    populateDropdown('year-filter', years);
    populateDropdown('airline-filter', airlines);
    populateDropdown('occasion-filter', occasions);
    populateDropdown('month-filter', months);
    populateDropdown('travelers-filter', travelers);
}

function getSelectedValues(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return [];
    return Array.from(element.selectedOptions).map(option => option.value);
}

function filterFlightData(data, filters) {
    return data.filter(flight => {
        const yearMatch = filters.years.length === 0 || filters.years.map(Number).includes(Number(flight.year));
        const airlineMatch = filters.airlines.length === 0 || filters.airlines.includes(flight.airline);
        const occasionMatch = filters.occasions.length === 0 || filters.occasions.includes(flight.occasion);
        const monthMatch = filters.months.length === 0 || filters.months.includes(flight.month);
        const travelersMatch = filters.travelers.length === 0 ||
            (Array.isArray(flight.travelers) && filters.travelers.some(t => flight.travelers.includes(t)));
        return yearMatch && airlineMatch && occasionMatch && monthMatch && travelersMatch;
    });
}

function setupFilterHandlers(initializeFlightPaths) {
    const applyButton = document.getElementById('apply-filters');
    const resetButton = document.getElementById('reset-filters');
    const toggleButton = document.getElementById('toggle-filters');
    const filterPanel = document.getElementById('filter-panel');

    if (toggleButton && filterPanel) {
        toggleButton.addEventListener('click', () => filterPanel.classList.toggle('collapsed'));
    }

    if (applyButton) {
        applyButton.addEventListener('click', () => {
            const filters = {
                years: getSelectedValues('year-filter'),
                airlines: getSelectedValues('airline-filter'),
                occasions: getSelectedValues('occasion-filter'),
                months: getSelectedValues('month-filter'),
                travelers: getSelectedValues('travelers-filter')
            };
            initializeFlightPaths(filterFlightData(flightRoutesData, filters));
        });
    }

    if (resetButton) {
        resetButton.addEventListener('click', () => {
            ['year-filter', 'airline-filter', 'occasion-filter', 'month-filter', 'travelers-filter'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.selectedIndex = -1;
            });
            initializeFlightPaths(flightRoutesData);
        });
    }
}

function generateDistinctColors(count) {
    const baseColors = [
        0xFFFF00, 0xFF8C00, 0x00BFFF, 0xFFFFFF, 0xFF1493,
        0x00FF00, 0xFF4500, 0x00FFFF, 0xFFD700, 0xFF69B4,
        0x00CED1, 0xFF6347
    ];
    const colors = [];
    for (let i = 0; i < count; i++) colors.push(baseColors[i % baseColors.length]);
    return colors;
}

function initEarth() {
    const container = document.getElementById('earth-container');
    if (!container) {
        console.error('Earth container not found');
        return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        logarithmicDepthBuffer: true
    });

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Filmic roll-off. Without it the ocean glint and the city lights clip to
    // flat white discs; ACES compresses them instead.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    container.appendChild(renderer.domElement);

    const earthRadius = 5;

    const textureLoader = new THREE.TextureLoader();
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    // Textures are served relative to the site root. This was previously
    // hardcoded to https://patrickfreyer.com/assets/, which meant preview
    // deployments silently pulled their textures from production.
    //
    // `colorSpace` matters as of three r152: colour maps (albedo/night/clouds)
    // must be tagged sRGB, while data maps (normal/specular/bump) stay linear.
    // Tagging them wrong renders the globe visibly too dark.
    // Progressive two-stage load. The full texture set is ~4.7 MB, which used
    // to leave the hero blank until every map had decoded. Stage 1 pulls a
    // 256x128 preview (a few KB, decodes almost immediately) so the globe is
    // visible right away; stage 2 swaps the full 4096x2048 image into the SAME
    // texture object as it arrives, so every material referencing it upgrades
    // without needing to know which material that was.
    const loadTexture = (lowUrl, fullUrl, { color = false } = {}) => {
        const configure = (tex) => {
            tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            tex.anisotropy = maxAnisotropy;
            return tex;
        };

        const tex = configure(textureLoader.load(lowUrl));

        textureLoader.load(
            fullUrl,
            (full) => {
                tex.image = full.image;
                tex.needsUpdate = true;   // re-uploads and regenerates mipmaps
                full.dispose();           // the wrapper is redundant once copied
            },
            undefined,
            () => { /* keep the preview if the full texture fails */ },
        );

        return tex;
    };

    const earthDayTexture   = loadTexture(albedoLow,   albedoFull,   { color: true });
    const earthNightTexture = loadTexture(nightLow,    nightFull,    { color: true });
    const cloudsTexture     = loadTexture(cloudsLow,   cloudsFull,   { color: true });
    const normalTexture     = loadTexture(normalLow,   normalFull);
    const specularTexture   = loadTexture(specularLow, specularFull);
    // NOTE: earth_roughness.jpg used to be loaded here and applied to nothing.
    // MeshPhongMaterial has no roughnessMap (that is MeshStandardMaterial), so
    // it cost a request plus ~45 MB of VRAM for no visual effect. Removed.

    // Base sphere to prevent flight routes from showing through.
    // Radius is fractionally smaller so it sits definitively behind the
    // earth sphere in the depth buffer regardless of tessellation mismatch.
    const baseMesh = new THREE.Mesh(
        new THREE.SphereGeometry(earthRadius * 0.999, 64, 64),
        new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    baseMesh.renderOrder = -1;
    scene.add(baseMesh);

    // The sun. Everything day/night derives from this single vector: the
    // DirectionalLight's position AND the terminator maths in the shaders below,
    // so three's own dot(N,L) and our night-light blend can never disagree.
    const sunDirection = new THREE.Vector3(1, 0.15, 0.35).normalize();

    // Earth layer
    const globeGeometry = new THREE.SphereGeometry(earthRadius, 64, 64);
    const globeMaterial = new THREE.MeshPhongMaterial({
        map: earthDayTexture,
        normalMap: normalTexture,
        normalScale: new THREE.Vector2(0.8, 0.8),
        specularMap: specularTexture,
        // NOTE: no bumpMap. three's normal_fragment_maps chunk is an #elif chain
        // where USE_NORMALMAP_TANGENTSPACE is tested BEFORE USE_BUMPMAP, so with a
        // normalMap set the bump branch is unreachable. It bound a sampler and cost
        // ~45 MB of VRAM while perturbing nothing.
        specular: new THREE.Color(0x333333),
        shininess: 15
    });

    // Keep this material's compiled program distinct from any other MeshPhongMaterial.
    globeMaterial.customProgramCacheKey = () => 'earth-terminator-v1';

    globeMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.nightMap = { value: earthNightTexture };
        shader.uniforms.cloudMap = { value: cloudsTexture };
        shader.uniforms.sunDirection = { value: sunDirection };
        shader.uniforms.terminatorSoftness = { value: 0.09 };
        shader.uniforms.nightLightIntensity = { value: 3.2 };
        shader.uniforms.cloudShadowStrength = { value: 0.32 };
        shader.uniforms.landShininess = { value: 6.0 };
        shader.uniforms.oceanShininess = { value: 120.0 };

        // The terminator must use the SMOOTH macro-surface normal. three's own
        // vNormal is view-space and is overwritten by normal mapping, so a
        // per-texel detail normal would make the day/night edge crawl with terrain.
        shader.vertexShader = shader.vertexShader
            .replace('#include <clipping_planes_pars_vertex>',
                '#include <clipping_planes_pars_vertex>\nvarying vec3 vWorldNormal;')
            .replace('#include <beginnormal_vertex>',
                '#include <beginnormal_vertex>\n\tvWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );');

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <clipping_planes_pars_fragment>',
                `#include <clipping_planes_pars_fragment>
                varying vec3 vWorldNormal;
                uniform sampler2D nightMap;
                uniform sampler2D cloudMap;
                uniform vec3 sunDirection;
                uniform float terminatorSoftness;
                uniform float nightLightIntensity;
                uniform float cloudShadowStrength;
                uniform float landShininess;
                uniform float oceanShininess;`)
            // dayMix once, at the top, reused by the shadow and emissive terms below
            .replace('#include <clipping_planes_fragment>',
                `#include <clipping_planes_fragment>
                float sunFacing = dot( normalize( vWorldNormal ), normalize( sunDirection ) );
                float dayMix = smoothstep( -terminatorSoftness, terminatorSoftness, sunFacing );`)
            // clouds darken the ground beneath them, but only on the lit side
            .replace('#include <map_fragment>',
                `#include <map_fragment>
                float cloudCover = texture2D( cloudMap, vMapUv ).r;
                diffuseColor.rgb *= mix( 1.0, 1.0 - cloudShadowStrength, cloudCover * dayMix );`)
            // tight bright glint on water, broad dull response on land.
            // specularStrength is three's own read of our specularMap - no extra sample.
            .replace('#include <lights_phong_fragment>',
                `#include <lights_phong_fragment>
                material.specularColor = mix( specular, vec3( 1.0 ), specularStrength * 0.6 );
                material.specularShininess = mix( landShininess, oceanShininess, specularStrength );`)
            // city lights as emissive on the dark side, gated by the SAME dayMix.
            // This replaces the old additive night-lights mesh entirely.
            .replace('#include <emissivemap_fragment>',
                `#include <emissivemap_fragment>
                vec3 nightColor = texture2D( nightMap, vMapUv ).rgb;
                totalEmissiveRadiance += nightColor * nightLightIntensity * ( 1.0 - dayMix );`);

        globeMaterial.userData.shader = shader;
    };

    const earthMesh = new THREE.Mesh(globeGeometry, globeMaterial);
    earthMesh.renderOrder = 0;
    scene.add(earthMesh);

    // The separate additive night-lights mesh is gone: it is now a per-fragment
    // emissive term above. It had been rendering at opacity 0 on every frame
    // anyway, because `state.isDaylight` was initialised true and never reassigned,
    // so the city lights had never actually been visible.

    // Cloud layer.
    // FrontSide, not DoubleSide: the camera can never get inside this shell
    // (controls.minDistance 6 vs shell radius 5.04), so back faces were pure waste -
    // double the rasterisation, plus a lit-far-hemisphere ghost at the limb.
    const cloudMaterial = new THREE.MeshPhongMaterial({
        map: cloudsTexture,
        transparent: true,
        opacity: 1.0,               // real opacity now comes from the shader below
        depthWrite: false,
        side: THREE.FrontSide,
        blending: THREE.NormalBlending
    });

    cloudMaterial.customProgramCacheKey = () => 'clouds-terminator-v1';
    cloudMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.sunDirection = { value: sunDirection };   // same vector object as the earth
        shader.uniforms.terminatorSoftness = { value: 0.09 };

        shader.vertexShader = shader.vertexShader
            .replace('#include <clipping_planes_pars_vertex>',
                '#include <clipping_planes_pars_vertex>\nvarying vec3 vWorldNormal;')
            .replace('#include <beginnormal_vertex>',
                '#include <beginnormal_vertex>\n\tvWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );');

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <clipping_planes_pars_fragment>',
                `#include <clipping_planes_pars_fragment>
                varying vec3 vWorldNormal;
                uniform vec3 sunDirection;
                uniform float terminatorSoftness;`)
            .replace('#include <map_fragment>',
                `#include <map_fragment>
                float sunFacing = dot( normalize( vWorldNormal ), normalize( sunDirection ) );
                float dayMix = smoothstep( -terminatorSoftness, terminatorSoftness, sunFacing );
                // Cloud brightness follows the sun, and the map's own luminance
                // becomes the alpha, so clear sky is genuinely transparent rather
                // than a uniform grey wash.
                float coverage = max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) );
                diffuseColor.a *= coverage * mix( 0.10, 0.55, dayMix );`);

        cloudMaterial.userData.shader = shader;
    };

    const cloudMesh = new THREE.Mesh(
        new THREE.SphereGeometry(earthRadius * 1.008, 64, 64),
        cloudMaterial
    );
    cloudMesh.renderOrder = 2;
    scene.add(cloudMesh);

    // ---- Atmosphere -------------------------------------------------------
    // Two cheap shells. Without these the globe has a razor-hard edge against
    // black; every real photograph of Earth has a soft blue limb.
    const atmosphereVertexShader = `
        varying vec3 vViewDir;
        varying vec3 vNormalView;
        void main() {
            vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
            vViewDir = normalize( mvPosition.xyz );
            vNormalView = normalize( normalMatrix * normal );
            gl_Position = projectionMatrix * mvPosition;
        }`;

    // (a) inner limb haze, sitting just outside the clouds
    const rimUniforms = {
        uColor: { value: new THREE.Color(0x8fc4ff) },
        uPower: { value: 3.2 },
        uIntensity: { value: 0.5 },
    };
    const rimMesh = new THREE.Mesh(
        new THREE.SphereGeometry(earthRadius * 1.012, 48, 48),
        new THREE.ShaderMaterial({
            uniforms: rimUniforms,
            vertexShader: atmosphereVertexShader,
            fragmentShader: `
                varying vec3 vViewDir;
                varying vec3 vNormalView;
                uniform vec3 uColor;
                uniform float uPower;
                uniform float uIntensity;
                void main() {
                    // clamp before pow(): pow() of a negative base is undefined in
                    // GLSL and flickers black on some drivers.
                    float grazing = clamp( 1.0 - abs( dot( vViewDir, vNormalView ) ), 0.0, 1.0 );
                    gl_FragColor = vec4( uColor, pow( grazing, uPower ) * uIntensity );
                }`,
            transparent: true,
            side: THREE.FrontSide,
            depthWrite: false,
            blending: THREE.NormalBlending,
        })
    );
    rimMesh.renderOrder = 5;
    scene.add(rimMesh);

    // (b) outer glow bleeding past the silhouette.
    // 1.08r = 5.40 against controls.minDistance 6 leaves 0.60 of clearance. Do not
    // enlarge this without raising minDistance: if the camera crosses inside a
    // BackSide shell the glow floods the entire screen.
    const glowUniforms = {
        uColor: { value: new THREE.Color(0x3f9dff) },
        uPower: { value: 2.6 },
        uIntensity: { value: 0.9 },
    };
    const glowMesh = new THREE.Mesh(
        new THREE.SphereGeometry(earthRadius * 1.08, 48, 48),
        new THREE.ShaderMaterial({
            uniforms: glowUniforms,
            vertexShader: atmosphereVertexShader,
            fragmentShader: `
                varying vec3 vViewDir;
                varying vec3 vNormalView;
                uniform vec3 uColor;
                uniform float uPower;
                uniform float uIntensity;
                void main() {
                    float facing = clamp( dot( vViewDir, vNormalView ), 0.0, 1.0 );
                    gl_FragColor = vec4( uColor, pow( facing, uPower ) * uIntensity );
                }`,
            transparent: true,
            side: THREE.BackSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        })
    );
    glowMesh.renderOrder = 6;
    scene.add(glowMesh);

    // ---- Lights -----------------------------------------------------------
    // One sun, plus a faint cool fill so the night limb reads as shadowed rather
    // than as a hole. The old HemisphereLight is gone: it lit the night side
    // uniformly, which is exactly what destroys a terminator.
    scene.add(new THREE.AmbientLight(0x4d6180, 1.75));

    const directionalLight = new THREE.DirectionalLight(0xfff4e0, 5.2);
    directionalLight.position.copy(sunDirection).multiplyScalar(earthRadius * 50);
    scene.add(directionalLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.3;
    controls.screenSpacePanning = false;
    controls.minDistance = 6;
    controls.maxDistance = 12;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;
    controls.zoomSpeed = 0.3;
    controls.enableZoom = true;
    controls.zoomDampingFactor = 0.1;

    function latLonToVector3(lat, lon, radius) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        return new THREE.Vector3(
            -(radius * Math.sin(phi) * Math.cos(theta)),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
    }

    const createPin = () => {
        const pinGroup = new THREE.Group();
        pinGroup.add(new THREE.Mesh(
            new THREE.SphereGeometry(0.015, 8, 8),
            new THREE.MeshPhongMaterial({ color: 0x4169E1, emissive: 0x0000ff, emissiveIntensity: 0.3, shininess: 50 })
        ));
        pinGroup.add(new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0x6495ED, transparent: true, opacity: 0.25 })
        ));
        return pinGroup;
    };

    locationsData.forEach(location => {
        const pin = createPin();
        pin.position.copy(latLonToVector3(location.lat, location.lon, earthRadius));
        pin.lookAt(new THREE.Vector3(0, 0, 0));
        pin.rotateX(Math.PI / 2);
        earthMesh.add(pin);
    });

    populateFilterDropdowns(flightRoutesData);

    // Group that holds all flight lines — cleared and rebuilt on filter
    const flightGroup = new THREE.Group();
    scene.add(flightGroup);

    // Cache: routeKey -> { pathsPoints, color } — computed once from full dataset
    let routeCache = null;

    function buildRouteCache(allRoutes) {
        const cache = new Map();
        const frequencies = countRouteFrequencies(allRoutes);
        const processed = new Set();
        const uniqueAirlines = [...new Set(allRoutes.map(r => r.airline))].filter(Boolean);
        const colors = generateDistinctColors(uniqueAirlines.length);
        const airlineColors = Object.fromEntries(uniqueAirlines.map((a, i) => [a, colors[i]]));
        airlineColors['default'] = 0x00ff00;

        allRoutes.forEach(route => {
            const cities = [route.origin, route.destination].sort();
            const routeKey = `${cities[0]}-${cities[1]}`;
            if (processed.has(routeKey)) return;
            processed.add(routeKey);

            const originLoc = findLocationByName(route.origin);
            const destLoc = findLocationByName(route.destination);
            if (!originLoc || !destLoc) {
                console.warn(`Skipping route: ${route.origin} -> ${route.destination} due to missing location data`);
                return;
            }

            const startPt = latLonToVector3(originLoc.lat, originLoc.lon, earthRadius);
            const endPt = latLonToVector3(destLoc.lat, destLoc.lon, earthRadius);
            const numLines = Math.min(Math.max(getRouteFrequency(route.origin, route.destination, frequencies), 1), 10);
            cache.set(routeKey, {
                pathsPoints: createFlightPath(startPt, endPt, earthRadius, numLines),
                color: airlineColors[route.airline] || airlineColors.default
            });
        });

        return cache;
    }

    // Dispose and remove all children from flightGroup
    function clearFlightGroup() {
        while (flightGroup.children.length > 0) {
            const child = flightGroup.children[0];
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material?.dispose();
            }
            flightGroup.remove(child);
        }
    }

    // Build merged LineSegments for all completed flights (2 draw calls total)
    // and individual dashed Lines for planned flights
    function renderFlightPaths(routes) {
        if (!routeCache) routeCache = buildRouteCache(flightRoutesData);

        clearFlightGroup();

        const routePlanned = {}, routeCompleted = {};
        routes.forEach(route => {
            const key = [route.origin, route.destination].sort().join('-');
            if (route.planned) routePlanned[key] = true;
            else routeCompleted[key] = true;
        });

        const activeKeys = new Set(
            routes.map(r => [r.origin, r.destination].sort().join('-'))
        );

        // Accumulate all completed-flight vertices into two flat arrays
        const mainV = [], mainC = [], glowV = [], glowC = [];

        activeKeys.forEach(routeKey => {
            const cached = routeCache.get(routeKey);
            if (!cached) return;

            const bright = new THREE.Color(cached.color).multiplyScalar(1.5);
            const r = bright.r, g = bright.g, b = bright.b;

            if (routeCompleted[routeKey]) {
                cached.pathsPoints.forEach(points => {
                    for (let i = 0; i < points.length - 1; i++) {
                        const p1 = points[i], p2 = points[i + 1];
                        mainV.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
                        mainC.push(r, g, b, r, g, b);
                        glowV.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
                        glowC.push(r, g, b, r, g, b);
                    }
                });
            }

            if (routePlanned[routeKey]) {
                // Planned flights keep individual dashed lines (required for correct dash pattern)
                createFlightLines(cached.pathsPoints, cached.color, true)
                    .forEach(line => flightGroup.add(line));
            }
        });

        // Single merged draw call for all completed glow lines
        if (glowV.length > 0) {
            const glowGeo = new THREE.BufferGeometry();
            glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowV, 3));
            glowGeo.setAttribute('color', new THREE.Float32BufferAttribute(glowC, 3));
            const glowSegs = new THREE.LineSegments(glowGeo, new THREE.LineBasicMaterial({
                vertexColors: true, transparent: true, opacity: 0.4, depthTest: true, depthWrite: false
            }));
            glowSegs.renderOrder = 0;
            flightGroup.add(glowSegs);
        }

        // Single merged draw call for all completed main lines
        if (mainV.length > 0) {
            const mainGeo = new THREE.BufferGeometry();
            mainGeo.setAttribute('position', new THREE.Float32BufferAttribute(mainV, 3));
            mainGeo.setAttribute('color', new THREE.Float32BufferAttribute(mainC, 3));
            const mainSegs = new THREE.LineSegments(mainGeo, new THREE.LineBasicMaterial({
                vertexColors: true, depthTest: true, depthWrite: true
            }));
            mainSegs.renderOrder = 1;
            flightGroup.add(mainSegs);
        }
    }

    function initializeFlightPaths(routes) {
        renderFlightPaths(routes);
    }

    setupFilterHandlers(initializeFlightPaths);

    camera.position.set(4, 8, 8);
    camera.lookAt(0, 0, 0);
    controls.update();

    // The sun is anchored RELATIVE TO THE CAMERA, not to world space.
    //
    // A sun fixed in world space is more physically honest, but it leaves the
    // visible hemisphere fully dark for half of every rotation - fine for a
    // simulation, wrong for a hero visual someone lands on at a random moment.
    // Offsetting it from the view direction keeps the face you are looking at lit
    // while parking the terminator near the right-hand limb, which is the classic
    // "Earth from space" framing and always shows a crescent of city lights.
    //
    // The offset breathes slowly so the scene is not frozen.
    const prefersReducedMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const SUN_YAW_BASE = THREE.MathUtils.degToRad(22);   // how far round the limb the terminator sits
    const SUN_YAW_SWING = THREE.MathUtils.degToRad(9);  // gentle drift either side of that
    const SUN_BREATH_SECONDS = 45;
    const SUN_PITCH = 0.28;                              // lift, so the terminator is not a vertical line
    let sunPhase = 0;
    let lastFrame = performance.now();
    const _camDir = new THREE.Vector3();

    function updateSun(delta) {
        if (!prefersReducedMotion) {
            sunPhase += (delta / SUN_BREATH_SECONDS) * Math.PI * 2;
        }
        const yaw = SUN_YAW_BASE + Math.sin(sunPhase) * SUN_YAW_SWING;

        // camera direction, flattened to the horizontal plane, then rotated round Y
        _camDir.copy(camera.position).normalize();
        const flatLen = Math.hypot(_camDir.x, _camDir.z) || 1;
        const camYaw = Math.atan2(_camDir.z, _camDir.x);

        sunDirection.set(
            Math.cos(camYaw + yaw) * flatLen,
            _camDir.y * 0.35 + SUN_PITCH,
            Math.sin(camYaw + yaw) * flatLen,
        ).normalize();

        directionalLight.position.copy(sunDirection).multiplyScalar(earthRadius * 50);

        // The shader uniforms hold the SAME Vector3 instance, so they follow
        // automatically; three re-uploads it each frame. Nothing to copy.
    }

    function animate() {
        requestAnimationFrame(animate);

        const now = performance.now();
        const delta = Math.min((now - lastFrame) / 1000, 0.1);  // clamp after tab-switch
        lastFrame = now;

        updateSun(delta);
        if (cloudMesh) cloudMesh.rotation.y = earthMesh.rotation.y * 1.1;
        controls.update();
        renderer.render(scene, camera);
    }

    function onWindowResize() {
        if (!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }

    window.addEventListener('resize', onWindowResize, false);

    // Start rendering immediately so the globe appears before flights are computed
    animate();

    // Defer expensive flight path geometry computation to after first frame
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            initializeFlightPaths(flightRoutesData);
        });
    });
}
