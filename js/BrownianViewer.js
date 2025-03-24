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
    
    this.createParticles(this.bacteriaRadius, 8, 0xff0000, 1000, this.bacteria, 0, this.cellRadius*2);
    
    // Initialize AR
    this.arHandler = new ARHandler(this.renderer, this.scene, this.cellGroup);
    this.setupCallbacks();
    
    this.animate();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.001, 3000);
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
      { color: 0xFFFFFF, intensity: 2.0, position: [0, -5, -1] },
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
    
    // Physical constants and environmental parameters
    const temperatureKelvin = 310; // Body temperature in Kelvin (37°C)
    const waterViscosity = 0.0008; // Water viscosity in Pa·s at body temperature
    const cytoplasmViscosity = 6 * waterViscosity;
    const boltzmannConstant = 1.38e-23;
    
    this.bacteriaRadius = 0.3;
    this.diffusionCoefficientBacteria = boltzmannConstant * temperatureKelvin / 
                                      (6 * Math.PI * waterViscosity * this.bacteriaRadius*(1/1e6));
    this.timeStep = 0.0001;
    this.bacteriaSD = Math.sqrt(2 * this.diffusionCoefficientBacteria * this.timeStep);
    this.bacteriaSD *= 1e6 / 0.641;
    this.cellRadius = 5/0.641;
    this.physicsTimeStep = 1/60;
    
    this.isARMode = false;
    this.modelPlaced = false;
    
    this.touchStartX = 0;
    this.touchStartY = 0;
    
    this.setupTouchInteraction();
    this.cellGroup = new THREE.Group();
    this.scene.add(this.cellGroup);
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
  
  createParticles(size, segments, color, number, particleGroup, minRadius, maxRadius) {
    const geometry = new THREE.SphereGeometry(size, segments, segments);
    const material = new THREE.MeshPhongMaterial({ emissive: color, emissiveIntensity: 1 });

    for (let i = 0; i < number; i++) {
      const particle = new THREE.Mesh(geometry, material);
      const randomUnitVector = () => new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
      
      const randomPosition = () => randomUnitVector().multiplyScalar(
        Math.random() * (maxRadius - minRadius) + minRadius
      );
      
      const position = randomPosition();
      particle.position.set(position.x, position.y, position.z);
      this.cellGroup.add(particle);
      particleGroup.push(particle);
      
      // Create physics body
      const rigidBody = this.physicsManager.createParticleBody(position, size);
      
      // Store reference
      rigidBody.userData = { threeObject: particle };
      this.rigidBodies.push(rigidBody);
    }
  }
  
  brownianMotion(sd, molecules, minRadius, maxRadius) {
    for (let i = 0; i < molecules.length; i++) {
      const rigidBody = this.rigidBodies[i];
      
      // Get current position
      const currentPosition = rigidBody.translation();
      
      // Generate normally distributed random displacements
      const [deltaX, deltaY] = normalPolar(0, sd);
      const deltaZ = normalPolar(0, sd)[0];
      
      // Calculate new position
      const newPosition = new THREE.Vector3(
        currentPosition.x + deltaX,
        currentPosition.y + deltaY,
        currentPosition.z + deltaZ
      );
      
      // Apply boundary constraints
      if (newPosition.length() > maxRadius) {
        newPosition.setLength(maxRadius);
      }
      
      // Update rigid body position
      rigidBody.setTranslation(
        { x: newPosition.x, y: newPosition.y, z: newPosition.z },
        true
      );
    }
  }

  animate() {
    // Apply Brownian motion
    this.brownianMotion(this.bacteriaSD, this.bacteria, 0, this.cellRadius*2);
    
    // Step the physics world forward
    this.world.step();
    
    // Update Three.js objects from physics positions
    for (let i = 0; i < this.bacteria.length; i++) {
      const rigidBody = this.rigidBodies[i];
      const molecule = this.bacteria[i];
      
      const position = rigidBody.translation();
      molecule.position.set(position.x, position.y, position.z);
    }
    
    if (this.isARMode) {
      this.arHandler.handleHitTest();
    }
    
    this.renderer.setAnimationLoop(this.animate.bind(this));
    this.renderer.render(this.scene, this.camera);
  }
}