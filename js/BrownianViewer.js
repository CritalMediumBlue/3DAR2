import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import RAPIER from 'rapier';
import { PhysicsManager } from './PhysicsManager.js';
import { ARHandler } from './ARHandler.js';
import { normalPolar } from './utils.js';

export class BrownianViewer {
  constructor() {
    // Initialize Rapier when the module is loaded
    RAPIER.init().then(() => {
      this.start();
    });
  }

  start() {
    this.initScene();
    this.initProperties();
    
    // Initialize physics
    this.physicsManager = new PhysicsManager(RAPIER);
    this.world = this.physicsManager.world;
    this.rigidBodies = this.physicsManager.rigidBodies;
    
    // Create a cubic boundary box
    this.createBoundaryBox();
    
    // Create particles
    this.createParticles(this.bacteriaRadius, 8, 0xff0000, 1500, this.bacteria, this.boxSize);
    this.createParticles(this.bacteriaRadius*2.12, 8, 0x00ffff, 4, this.bacteria, this.boxSize);
    // Initialize AR
    this.arHandler = new ARHandler(this.renderer, this.scene, this.cellGroup);
    this.setupCallbacks();
    
    // Setup UI controls
    this.setupUIControls();
    
    this.animate();
  }
  
  setupUIControls() {
    // Get UI elements
    const selfPropulsionSlider = document.getElementById('selfPropulsionSpeed');
    const rotationalDiffusionSlider = document.getElementById('rotationalDiffusion');
    const translationalNoiseSlider = document.getElementById('translationalNoise');
    const resetButton = document.getElementById('resetButton');
    
    // Get value display elements
    const selfPropulsionValue = document.getElementById('selfPropulsionSpeedValue');
    const rotationalDiffusionValue = document.getElementById('rotationalDiffusionValue');
    const translationalNoiseValue = document.getElementById('translationalNoiseValue');
    
    // Set initial values
    selfPropulsionSlider.value = this.selfPropulsionSpeed;
    rotationalDiffusionSlider.value = this.rotationalDiffusionCoefficient;
    translationalNoiseSlider.value = 1.0; // Default scale factor for translational noise
    
    // Update value displays
    selfPropulsionValue.textContent = this.selfPropulsionSpeed.toFixed(1);
    rotationalDiffusionValue.textContent = this.rotationalDiffusionCoefficient.toFixed(2);
    translationalNoiseValue.textContent = '1.0';
    
    // Store original bacteriaSD for scaling
    this.originalBacteriaSD = this.bacteriaSD;
    
    // Add event listeners
    selfPropulsionSlider.addEventListener('input', (event) => {
      this.selfPropulsionSpeed = parseFloat(event.target.value);
      selfPropulsionValue.textContent = this.selfPropulsionSpeed.toFixed(1);
    });
    
    rotationalDiffusionSlider.addEventListener('input', (event) => {
      this.rotationalDiffusionCoefficient = parseFloat(event.target.value);
      rotationalDiffusionValue.textContent = this.rotationalDiffusionCoefficient.toFixed(2);
    });
    
    translationalNoiseSlider.addEventListener('input', (event) => {
      const scale = parseFloat(event.target.value);
      this.bacteriaSD = this.originalBacteriaSD * scale;
      translationalNoiseValue.textContent = scale.toFixed(2);
    });
    
    // Reset button
    resetButton.addEventListener('click', () => {
      this.resetSimulation();
    });
  }
  
  resetSimulation() {
    // Clear existing particles
    for (let i = this.bacteria.length - 1; i >= 0; i--) {
      const particle = this.bacteria[i];
      this.cellGroup.remove(particle);
    }
    
    // Clear arrays
    this.bacteria = [];
    this.bacteriaOrientations = [];
    
    // Clear rigid bodies
    for (let i = this.rigidBodies.length - 1; i >= 0; i--) {
      const rigidBody = this.rigidBodies[i];
      this.world.removeRigidBody(rigidBody);
    }
    this.rigidBodies = [];
    this.physicsManager.rigidBodies = [];
    
    // Create new particles
    this.createParticles(this.bacteriaRadius, 8, 0xff0000, 3000, this.bacteria, this.boxSize);
    this.createParticles(this.bacteriaRadius*2.12, 8, 0x00ffff, 4, this.bacteria, this.boxSize);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 20, 3000);
    this.camera.position.set(20, 20, 20);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    document.body.appendChild(this.renderer.domElement);
    
    window.addEventListener('resize', this.onWindowResize.bind(this), false);
    
    this.setupLights();
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
  }
  
  setupLights() {
    this.lightGroup = new THREE.Group();
    this.scene.add(this.lightGroup);
    
    const lights = [
      { color: 0xFFFFFF, intensity: 2.0, position: [3, 10, 3] },
      { color: 0xFFFFFF, intensity: 2.0, position: [0, -10, -1] },
      { color: 0xFFFFFF, intensity: 2.0, position: [-10, 0, 0] }
    ];
    
    lights.forEach(({ color, intensity, position }) => {
      const light = new THREE.DirectionalLight(color, intensity);
      light.position.set(...position).normalize();
      this.lightGroup.add(light);
    });
  }
  
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  initProperties() {
    this.bacteria = [];
    this.bacteriaOrientations = []; // Store 3D orientation for each particle
    
    // Physical constants and environmental parameters
    const temperatureKelvin = 310; // Body temperature in Kelvin (37°C)
    const waterViscosity = 0.0008; // Water viscosity in Pa·s at body temperature
    const boltzmannConstant = 1.38e-23;
    
    this.bacteriaRadius = 0.3;
    this.diffusionCoefficientBacteria = boltzmannConstant * temperatureKelvin / 
                                      (6 * Math.PI * waterViscosity * this.bacteriaRadius*(1/1e6));
    this.timeStep = 0.0001;
    this.bacteriaSD = Math.sqrt(2 * this.diffusionCoefficientBacteria * this.timeStep);
    this.bacteriaSD *= 1e6 / 0.641;
    
    // Define cubic boundary parameters
    this.boxSize = 7; // Size of the cubic box (half-width)
    this.physicsTimeStep = 1/60;
    
    // MIPS parameters
    this.selfPropulsionSpeed = 100; // Self-propulsion velocity
    this.rotationalDiffusionCoefficient = 0.5; // Controls how quickly particles change direction
    
    this.isARMode = false;
    this.modelPlaced = false;
    
    this.touchStartX = 0;
    this.touchStartY = 0;
    
    this.setupTouchInteraction();
    this.cellGroup = new THREE.Group();
    this.scene.add(this.cellGroup);
  }
  
  createBoundaryBox() {
    // Create a wireframe box to visualize the boundary
    const boxGeometry = new THREE.BoxGeometry(this.boxSize * 2, this.boxSize * 2, this.boxSize * 2);
    const wireframe = new THREE.EdgesGeometry(boxGeometry);
    const boxMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.6 });
    const box = new THREE.LineSegments(wireframe, boxMaterial);
    this.cellGroup.add(box);
  }
  
  setupTouchInteraction() {
    document.addEventListener('touchstart', (event) => {
      if (this.isARMode && this.modelPlaced && event.touches.length > 0) {
        this.touchStartX = event.touches[0].clientX;
        this.touchStartY = event.touches[0].clientY;
      }
    });
    
    document.addEventListener('touchmove', (event) => {
      if (this.isARMode && this.modelPlaced && event.touches.length > 0) {
        event.preventDefault();
        
        if (event.touches.length === 1) {
          const touchX = event.touches[0].clientX;
          const touchY = event.touches[0].clientY;
          
          const deltaX = touchX - this.touchStartX;
          this.cellGroup.rotation.y += deltaX * 0.01;

          const deltaY = touchY - this.touchStartY;
          this.cellGroup.rotation.x += deltaY * 0.01;
          
          this.touchStartX = touchX;
          this.touchStartY = touchY;
        }
      }
    }, { passive: false });
  }
  
  setupCallbacks() {
    // Set callbacks for AR events
    this.arHandler.onSessionStart = () => {
      this.isARMode = true;
      this.cellGroup.visible = false;
      this.modelPlaced = false;
      
      if (this.controls) {
        this.controls.enabled = false;
      }
    };
    
    this.arHandler.onModelPlaced = () => {
      this.modelPlaced = true;
    };
  }
  
  createParticles(size, segments, color, number, particleGroup, boxSize) {
    const geometry = new THREE.SphereGeometry(size, segments, segments);
    const material = new THREE.MeshPhongMaterial({ 
      emissive: color, 
      emissiveIntensity: 1,
      transparent: true, 
      opacity: 0.8 
    });

    for (let i = 0; i < number; i++) {
      const particle = new THREE.Mesh(geometry, material);
      
      // Generate random position within the cubic box
      const position = new THREE.Vector3(
        (Math.random() * 2 - 1) * boxSize,
        (Math.random() * 2 - 1) * boxSize,
        (Math.random() * 2 - 1) * boxSize
      );
      
      particle.position.set(position.x, position.y, position.z);
      this.cellGroup.add(particle);
      particleGroup.push(particle);
      
      // Create physics body
      const rigidBody = this.physicsManager.createParticleBody(position, size);
      
      // Store reference
      rigidBody.userData = { threeObject: particle };
      this.rigidBodies.push(rigidBody);
      
      // Initialize random 3D orientation as a unit vector
      const randomUnitVector = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
      
      this.bacteriaOrientations.push(randomUnitVector);
    }
  }
  
  // Update particle orientations with rotational diffusion in 3D
  updateOrientations(dt) {
    for (let i = 0; i < this.bacteria.length; i++) {
      const orientation = this.bacteriaOrientations[i];
      
      // Generate 3D rotational noise
      const noiseScale = Math.sqrt(2 * this.rotationalDiffusionCoefficient * dt);
      const [noiseX, noiseY] = normalPolar(0, noiseScale);
      const noiseZ = normalPolar(0, noiseScale)[0];
      
      // Apply noise to orientation vector
      orientation.x += noiseX;
      orientation.y += noiseY;
      orientation.z += noiseZ;
      
      // Re-normalize to keep it as a unit vector
      orientation.normalize();
    }
  }
  
  // Apply periodic boundary conditions
  applyPeriodicBoundary(position) {
    // Check each dimension and wrap if needed
    if (position.x > this.boxSize) {
      position.x -= this.boxSize * 2;
    } else if (position.x < -this.boxSize) {
      position.x += this.boxSize * 2;
    }
    
    if (position.y > this.boxSize) {
      position.y -= this.boxSize * 2;
    } else if (position.y < -this.boxSize) {
      position.y += this.boxSize * 2;
    }
    
    if (position.z > this.boxSize) {
      position.z -= this.boxSize * 2;
    } else if (position.z < -this.boxSize) {
      position.z += this.boxSize * 2;
    }
    
    return position;
  }
  
  // Modified to include self-propulsion based on 3D orientation with periodic boundary
  brownianMotion(sd, molecules) {
    for (let i = 0; i < molecules.length; i++) {
      const rigidBody = this.rigidBodies[i];
      const orientation = this.bacteriaOrientations[i];
      
      // Get current position
      const currentPosition = rigidBody.translation();
      
      // Use the orientation vector directly for self-propulsion
      const orientationVector = {
        x: orientation.x,
        y: orientation.y,
        z: orientation.z
      };
      
      // Generate normally distributed random displacements (translational noise)
      const [deltaX, deltaY] = normalPolar(0, sd);
      const deltaZ = normalPolar(0, sd)[0];
      
      // Calculate new position with self-propulsion and noise
      const newPosition = new THREE.Vector3(
        currentPosition.x + (this.selfPropulsionSpeed * orientationVector.x * this.timeStep) + deltaX,
        currentPosition.y + (this.selfPropulsionSpeed * orientationVector.y * this.timeStep) + deltaY,
        currentPosition.z + (this.selfPropulsionSpeed * orientationVector.z * this.timeStep) + deltaZ
      );
      
      // Apply periodic boundary conditions
      this.applyPeriodicBoundary(newPosition);
      
      // Update rigid body position
      rigidBody.setTranslation(
        { x: newPosition.x, y: newPosition.y, z: newPosition.z },
        true
      );
    }
  }

  animate() {
    // Update orientations with rotational diffusion
    this.updateOrientations(this.timeStep);
    
    // Apply Brownian motion with self-propulsion and periodic boundary
    this.brownianMotion(this.bacteriaSD, this.bacteria);
    
    // Step the physics world forward
    this.world.step();
    
    // Update Three.js objects from physics positions
    for (let i = 0; i < this.bacteria.length; i++) {
      const rigidBody = this.rigidBodies[i];
      const molecule = this.bacteria[i];
      const orientation = this.bacteriaOrientations[i];
      
      const position = rigidBody.translation();
      molecule.position.set(position.x, position.y, position.z);
      
      // Update rotation to match 3D orientation
      // Create a rotation matrix that aligns the particle with its orientation vector
      molecule.lookAt(
        position.x + orientation.x,
        position.y + orientation.y,
        position.z + orientation.z
      );
    }
    
    if (this.isARMode) {
      this.arHandler.handleHitTest();
    }
    
    this.renderer.setAnimationLoop(this.animate.bind(this));
    this.renderer.render(this.scene, this.camera);
  }
}
