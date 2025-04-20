# Flight Globe Visualization with Three.js

This document explains the implementation of a 3D flight path visualization using Three.js, similar to the one used in flight tracking applications.

## Overview

The visualization creates an interactive 3D globe with flight paths rendered as curved lines between airports. The implementation includes multiple visual layers, dynamic lighting, and smooth animations.

## Core Components

### 1. Globe Structure

The globe consists of multiple layers:
- Base Earth layer with day texture
- Night lights layer for city illumination
- Cloud layer with transparency
- Flight paths rendered on top

```javascript
const globeGeometry = new THREE.SphereGeometry(1, 64, 64);
const globeMaterial = new THREE.MeshPhongMaterial({
    map: earthTexture,
    normalMap: normalTexture,
    specularMap: specularTexture,
    bumpMap: bumpTexture,
    bumpScale: 0.05,
    specular: new THREE.Color(0x333333),
    shininess: 25
});
```

### 2. Flight Path Generation

Each flight path is created using these key steps:

1. **Coordinate Conversion**
```javascript
// Convert airport lat/long to 3D vectors
const startPoint = latLngToVector3(fromLat, fromLng);
const endPoint = latLngToVector3(toLat, toLng);
```

2. **Path Curvature**
```javascript
// Calculate height scale based on distance
const maxHeightScale = 0.08;
const baseScale = Math.atan(distance) / (Math.PI / 2) * maxHeightScale;

// Generate curved path points
const points = [];
for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const point = startPoint.clone().normalize();
    point.lerp(endPoint.clone().normalize(), t).normalize();
    const heightScale = 1 + baseScale * Math.sin(Math.PI * t);
    point.multiplyScalar(heightScale);
    points.push(point);
}
```

3. **Smooth Curve Creation**
```javascript
const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
```

### 3. Multiple Flight Lines

For busy routes, multiple parallel lines are created to represent frequency:

```javascript
// Calculate perpendicular direction for parallel lines
const pathDirection = curveEnd.clone().sub(curveStart).normalize();
const globeNormal = curveStart.clone().add(curveEnd).normalize();
const perpDirection = pathDirection.clone().cross(globeNormal).normalize();

// Create offset lines
for (let i = 0; i < numLines; i++) {
    const offset = perpDirection.clone().multiplyScalar(0.001 * (i - (numLines - 1) / 2));
    const points = basePoints.map(point => {
        return point.clone().add(offset);
    });
    // Create line with offset
}
```

### 4. Visual Effects

#### Flight Path Material
```javascript
const lineMaterial = new THREE.LineBasicMaterial({
    color: airlineColors[airline] || 0xffffff,
    transparent: true,
    opacity: 0.8,
    linewidth: state.lineWidth,
    depthTest: true,
    depthWrite: false
});
```

#### Airport Markers
```javascript
const dotGeometry = new THREE.SphereGeometry(0.005, 16, 16);
const dotMaterial = new THREE.MeshBasicMaterial({
    color: airlineColors[airline] || 0xffffff,
    transparent: true,
    opacity: 0.8
});
```

### 5. Post-Processing Effects

The visualization uses post-processing for enhanced visual appeal:

```javascript
// Setup effect composer
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Add bloom effect
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,  // Bloom intensity
    0.4,  // Bloom radius
    0.85  // Bloom threshold
);
composer.addPass(bloomPass);
```

## Performance Optimizations

1. **Efficient Geometry**
```javascript
const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
```

2. **Visibility Management**
```javascript
// Update visibility based on filters
flightPath.line.visible = visible;
flightPath.additionalLines.forEach(line => line.visible = visible);
```

3. **Resource Cleanup**
```javascript
// Dispose of geometries and materials when removing flight paths
path.line.geometry.dispose();
path.line.material.dispose();
```

## Implementation Guide

To implement this visualization in your own project:

1. **Basic Setup**
```javascript
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
```

2. **Create Earth**
```javascript
const globeGeometry = new THREE.SphereGeometry(1, 64, 64);
const globeMaterial = new THREE.MeshPhongMaterial({
    map: earthTexture,
    normalMap: normalTexture,
    specularMap: specularTexture,
    bumpMap: bumpTexture
});
const globe = new THREE.Mesh(globeGeometry, globeMaterial);
scene.add(globe);
```

3. **Add Flight Paths**
```javascript
function createFlightPath(startPoint, endPoint) {
    const points = [];
    const numPoints = 50;
    const maxHeight = 0.08;
    
    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const point = startPoint.clone().normalize();
        point.lerp(endPoint.clone().normalize(), t).normalize();
        const heightScale = 1 + maxHeight * Math.sin(Math.PI * t);
        point.multiplyScalar(heightScale);
        points.push(point);
    }
    
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(50));
    const material = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8
    });
    
    return new THREE.Line(geometry, material);
}
```

4. **Setup Post-Processing**
```javascript
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5, 0.4, 0.85
);
composer.addPass(renderPass);
composer.addPass(bloomPass);
```

5. **Animation Loop**
```javascript
function animate() {
    requestAnimationFrame(animate);
    // Update any animations
    composer.render();
}
```

## Key Tips for Success

1. **Smooth Curves**: Use Catmull-Rom curves for natural-looking flight paths
2. **Multiple Lines**: Implement parallel lines for busy routes
3. **Visual Effects**: Add bloom and glow effects for enhanced appearance
4. **Performance**: Use BufferGeometry and implement proper cleanup
5. **Depth Testing**: Configure proper depth testing and transparency
6. **Animation**: Implement smooth transitions and animations

## Required Dependencies

- Three.js
- EffectComposer
- UnrealBloomPass
- OrbitControls (for interaction)

## Resources

- [Three.js Documentation](https://threejs.org/docs/)
- [WebGL Fundamentals](https://webglfundamentals.org/)
- [Three.js Examples](https://threejs.org/examples/) 