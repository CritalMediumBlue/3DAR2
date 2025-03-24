export class PhysicsManager {
  constructor(RAPIER) {
    this.RAPIER = RAPIER;
    this.initPhysics();
  }

  initPhysics() {
    // Create a new physics world with no gravity (for pure Brownian motion)
    const gravity = { x: 0.0, y: 0.0, z: 0.0 };
    this.world = new this.RAPIER.World(gravity);
    
    // Store rigid bodies
    this.rigidBodies = [];
  }
  
  createParticleBody(position, size) {
    // Create a rigid body
    const rigidBodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(10000); // Add some damping to simulate viscosity
      
    const rigidBody = this.world.createRigidBody(rigidBodyDesc);
    
    // Create a collider (sphere)
    const colliderDesc = this.RAPIER.ColliderDesc.ball(size)
      .setRestitution(1) // Elastic collisions
      .setFriction(0.0)  // No friction
      .setDensity(0.0000001); // Density of water
    
    this.world.createCollider(colliderDesc, rigidBody);
    
    return rigidBody;
  }
}