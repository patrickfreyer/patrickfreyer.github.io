import * as THREE from 'https://cdn.skypack.dev/three@0.128.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.128.0/examples/jsm/controls/OrbitControls.js';

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
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const earthRadius = 5;
    const state = { isDaylight: true };

    const textureLoader = new THREE.TextureLoader();
    const loadTexture = (path) => textureLoader.load(`https://patrickfreyer.com/assets/${path}`);

    const earthDayTexture = loadTexture('earth_albedo.jpg');
    const earthNightTexture = loadTexture('earth_night.jpg');
    const normalTexture = loadTexture('earth_normal.jpg');
    const specularTexture = loadTexture('earth_specular.jpg');
    const roughnessTexture = loadTexture('earth_roughness.jpg');
    const bumpTexture = loadTexture('earth_bump.jpg');
    const cloudsTexture = loadTexture('earth_clouds.jpg');

    // Base sphere to prevent flight routes from showing through.
    // Radius is fractionally smaller so it sits definitively behind the
    // earth sphere in the depth buffer regardless of tessellation mismatch.
    const baseMesh = new THREE.Mesh(
        new THREE.SphereGeometry(earthRadius * 0.999, 64, 64),
        new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    baseMesh.renderOrder = -1;
    scene.add(baseMesh);

    // Earth layer
    const globeGeometry = new THREE.SphereGeometry(earthRadius, 64, 64);
    const globeMaterial = new THREE.MeshPhongMaterial({
        map: earthDayTexture,
        normalMap: normalTexture,
        normalScale: new THREE.Vector2(0.8, 0.8),
        specularMap: specularTexture,
        bumpMap: bumpTexture,
        bumpScale: 0.02,
        specular: new THREE.Color(0x444444),
        shininess: 15
    });
    const earthMesh = new THREE.Mesh(globeGeometry, globeMaterial);
    earthMesh.renderOrder = 0;
    scene.add(earthMesh);

    // Night lights layer
    const nightMesh = new THREE.Mesh(
        new THREE.SphereGeometry(earthRadius * 1.001, 64, 64),
        new THREE.MeshBasicMaterial({
            map: earthNightTexture,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: state.isDaylight ? 0 : 0.8,
            depthWrite: false
        })
    );
    nightMesh.renderOrder = 0;
    scene.add(nightMesh);

    // Cloud layer
    const cloudMesh = new THREE.Mesh(
        new THREE.SphereGeometry(earthRadius * 1.008, 64, 64),
        new THREE.MeshPhongMaterial({
            map: cloudsTexture,
            transparent: true,
            opacity: state.isDaylight ? 0.3 : 0.1,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.NormalBlending
        })
    );
    cloudMesh.renderOrder = 0;
    scene.add(cloudMesh);

    scene.add(new THREE.AmbientLight(0xffffff, state.isDaylight ? 0.3 : 0.1));

    const directionalLight = new THREE.DirectionalLight(0xffffff, state.isDaylight ? 2.0 : 0.15);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, state.isDaylight ? 0.6 : 0));

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

    function animate() {
        requestAnimationFrame(animate);
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
