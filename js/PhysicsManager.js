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
      .setLinearDamping(5.0); // Reduced damping for MIPS (allows more persistent motion)
      
    const rigidBody = this.world.createRigidBody(rigidBodyDesc);
    
    // Create a collider (sphere)
    const colliderDesc = this.RAPIER.ColliderDesc.ball(size)
      .setRestitution(0.8) // Slightly inelastic collisions (helps with clustering)
      .setFriction(0.1)    // Small friction (helps with phase separation)
      .setDensity(0.0000001); // Density of water
    
    this.world.createCollider(colliderDesc, rigidBody);
    
    return rigidBody;
  }
}
