# Earth Globe Visualization in Three.js

This document provides a detailed explanation of how the 3D Earth globe is implemented using Three.js, including all its layers, lighting systems, and visual effects.

## Layer Structure

The Earth visualization consists of multiple layered spheres, each serving a specific purpose:

### 1. Base Earth Layer (Radius: 1.0)
```javascript
const globeGeometry = new THREE.SphereGeometry(1, 64, 64);
const globeMaterial = new THREE.MeshPhongMaterial({
    map: earthTexture,           // Day texture (land, seas, etc.)
    normalMap: normalTexture,    // Surface detail/bump mapping
    specularMap: specularTexture,// Reflectivity map
    bumpMap: bumpTexture,       // Additional surface detail
    bumpScale: 0.05,            // Intensity of the bump effect
    specular: new THREE.Color(0x333333), // Color of specular highlights
    shininess: 25               // Size/sharpness of specular highlights
});
```

**Texture Maps Used:**
- `earthTexture`: High-resolution day map showing continents, oceans
- `normalTexture`: Adds surface detail through normal mapping
- `specularTexture`: Controls which areas are reflective
- `bumpTexture`: Provides additional surface relief

### 2. Night Lights Layer (Radius: 1.001)
```javascript
const nightGeometry = new THREE.SphereGeometry(1.001, 64, 64);
const nightMaterial = new THREE.MeshBasicMaterial({
    map: nightTexture,          // City lights texture
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: state.isDaylight ? 0 : 0.8,
    depthWrite: false
});
```

**Key Features:**
- Slightly larger radius to prevent z-fighting
- Additive blending for realistic light glow
- Dynamic opacity based on day/night state
- No depth writing to prevent visual artifacts

### 3. Cloud Layer (Radius: 1.008)
```javascript
const cloudGeometry = new THREE.SphereGeometry(1.008, 64, 64);
const cloudMaterial = new THREE.MeshPhongMaterial({
    map: cloudsTexture,
    transparent: true,
    opacity: state.isDaylight ? 0.3 : 0.1,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending
});
```

**Characteristics:**
- Outermost layer for cloud coverage
- Semi-transparent for realistic cloud effect
- Double-sided rendering
- Dynamic opacity based on day/night state

## Lighting System

The Earth uses a complex lighting setup with three light types:

### 1. Ambient Light
```javascript
const ambientLight = new THREE.AmbientLight(0xffffff, state.isDaylight ? 1.0 : 0.1);
```
- Provides base illumination
- Intensity varies with day/night state
- Ensures shadows aren't too dark

### 2. Directional Light (Sun)
```javascript
const directionalLight = new THREE.DirectionalLight(0xffffff, state.isDaylight ? 2.0 : 0.15);
directionalLight.position.set(5, 3, 5);
```
- Simulates sunlight
- Creates realistic shadows and highlights
- Position determines day/night regions

### 3. Hemisphere Light
```javascript
const hemisphereLight = new THREE.HemisphereLight(
    0xffffff,   // Sky color
    0x444444,   // Ground color
    state.isDaylight ? 1.0 : 0
);
```
- Provides subtle atmospheric lighting
- Improves realism of day lighting
- Automatically disabled at night

## Day/Night Transition System

The visualization includes a smooth transition system between day and night states:

```javascript
function transitionDayNight(state, globeMaterial) {
    // Target values for day/night transition
    const targetValues = {
        nightOpacity: state.isDaylight ? 0 : 0.8,
        cloudOpacity: state.isDaylight ? 0.4 : 0.2,
        ambientIntensity: state.isDaylight ? 1.0 : 0.1,
        directionalIntensity: state.isDaylight ? 2.0 : 0.15,
        hemisphereIntensity: state.isDaylight ? 1.0 : 0
    };

    // Smooth easing function
    const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    // Apply transitions
    updateLightingValues(eased, currentValues, targetValues);
}
```

## Visual Effects and Post-Processing

### 1. Atmosphere Effect
The atmosphere is simulated through a combination of:
- Cloud layer transparency
- Hemisphere lighting
- Bloom post-processing

### 2. Bloom Effect
```javascript
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,  // Intensity
    0.4,  // Radius
    0.85  // Threshold
);
```
- Adds realistic glow to bright areas
- Enhances night lights
- Creates subtle atmospheric scatter

## Performance Considerations

### 1. Geometry Optimization
- Using appropriate polygon counts (64 segments)
- Shared geometries between instances
- Proper disposal of unused resources

### 2. Texture Management
```javascript
const textureLoader = new THREE.TextureLoader();
// Preload and reuse textures
const earthTexture = textureLoader.load('./textures/earth_albedo.jpg', onTextureLoaded);
```
- Preloading of textures
- Proper texture compression
- Mipmap generation for distant views

### 3. Render Layer Organization
- Proper layer ordering
- Strategic use of transparency
- Depth testing optimization

## Required Textures

For a complete Earth visualization, you need these texture maps:

1. **Day Map** (`earth_albedo.jpg`)
   - Color texture of Earth during daylight
   - Shows continents, oceans, terrain

2. **Night Map** (`earth_night.jpg`)
   - City lights and illuminated areas
   - Used for night side visualization

3. **Normal Map** (`earth_normal.jpg`)
   - Surface detail and terrain information
   - Enhances visual depth

4. **Specular Map** (`earth_specular.jpg`)
   - Controls surface reflectivity
   - Different for land and water

5. **Cloud Map** (`earth_clouds.jpg`)
   - Cloud coverage patterns
   - Semi-transparent white clouds

6. **Bump Map** (`earth_bump.jpg`)
   - Additional surface detail
   - Enhances terrain visualization

## Implementation Tips

1. **Texture Resolution**
   - Use power-of-two textures (2048x1024, 4096x2048)
   - Consider device performance for texture size
   - Implement progressive loading for mobile

2. **Layer Order**
   - Base Earth (1.0)
   - Night Lights (1.001)
   - Clouds (1.008)
   - Maintain small radius differences

3. **Lighting Setup**
   - Position lights for realistic shadows
   - Adjust intensities for desired contrast
   - Consider performance vs. quality

4. **Animation**
   - Smooth cloud layer rotation
   - Day/night transition timing
   - Performance-conscious update rate

## Resources

- [Earth Texture Maps](https://visibleearth.nasa.gov/collection/1484/blue-marble)
- [Normal Map Generation](http://cpetry.github.io/NormalMap-Online/)
- [Three.js Earth Example](https://threejs.org/examples/#webgl_materials_earth) 