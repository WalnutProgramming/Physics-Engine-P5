class Mover {
	constructor({ 
		mass = random(0.5, 3),
		// location is the position of the center of mass
		loc = createVector(random(canvasWidth()),(0.5*canvasHeight())),
		vel = createVector(0, 0),
		acc = createVector(0, 0),
		hasGravity = true
	}) {
		this.mass = mass;
		this.loc = loc;
		this.vel = vel;
		this.acc = acc;
		this.hasGravity = hasGravity;
	}

	//divides the force by the objects mass then adds to acceleration
	applyForce(f){
		// Note: we use mult(1/) instead of div() because div() doesn't like dividing by Infinity
		let force = f.mult(1 / this.mass);
		this.acc.add(force);
	}

	//updates the object's position and velocity
	update(){
		this.vel.add(this.acc);
		this.loc.add(this.vel);
		//all components of vector multiplied by 0 will become 0 (new net force on frame)
		this.acc.mult(0); 
	}

	// convenience functions
	getVel() {
		return this.vel.copy();
	}

	get x() {
		return this.loc.x;
	}

	get y() {
		return this.loc.y;
	}
}

class BoxMover extends Mover {
	constructor({
		width = random(50, 100),
		height = random(50, 100),
		...options
	} = {}) {
		super(options);
		this.width = width;
		this.height = height;
	}

	show() {
		fill(255);
		noStroke();
		rectMode(CENTER);
		
		const { x, y } = coordToPixels(this.loc)
		const width = distToPixels(this.width)
		const height = distToPixels(this.height)
		rect(x, y, width, height);
	}
}

class CircleMover extends Mover {
	constructor(options = {}) {
		super(options);
	}

	get radius() {
		return this.mass * 10;
	}

	get diameter() {
		return this.radius * 2;
	}

	//draws the spheres on the canvas
	show(){
		fill(255);
		noStroke();

		const { x, y } = coordToPixels(this.loc)
		const diameter = distToPixels(this.diameter)
		ellipse(x, y, diameter, diameter);
	}

	get min() {
		return {
			x: this.x - this.radius,
			y: this.y - this.radius
		};
	}

	get max() {
		return {
			x: this.x + this.radius,
			y: this.y + this.radius
		};
	}
}

class Draggable {
	constructor(x,y,w,h){
		this.dragging = false;
		this.mouseOver = false;
		this.x = x;
		this.y = y;
		this.w = w;
		this.h = h;
		this.offsetX = 0;
		this.offsetY = 0;
	}

	mousedOver(){
		let d = pow(this.w/2,2) - (pow(this.x - mouseX,2) + pow(this.y - mouseY,2))
		if(d >= 0){
			this.rollover = true;
		}
		else{
			this.rollover = false;
		}
	}

	update(){
		if (this.dragging) {
			this.x = mouseX + this.offsetX;
			this.y = mouseY + this.offsetY;
		}
		if(this.x < 0)
			this.x = 0
		if(this.y < 0)
			this.y = 0
		if(this.x > canvasWidth())
			this.x = canvasWidth()
		if(this.y > canvasHeight())
			this.y = canvasHeight()
	}

	draw(){
		stroke(0);
		if (this.dragging) {
			fill(50);
		} else if (this.rollover) {
			fill(100);
		} else {
			fill(175, 200);
		}
		ellipse(this.x, this.y, this.w, this.h);
	}

	pressed(){
		let d = pow(this.w/2,2) - (pow(this.x - mouseX,2) + pow(this.y - mouseY,2))
		if(d >= 0){
			this.dragging = true;
			this.offsetX = this.x - mouseX;
			this.offsetY = this.y - mouseY;
		}
	}

	released(){
		this.dragging = false;
	}
}

class Ruler {

	constructor(){
		this.mainx = canvasWidth()/2;
		this.mainy = canvasHeight()/2;
		this.shape1 = new Draggable(this.mainx - (this.mainx/2), this.mainy - (this.mainy/2), 20, 20)
		this.shape2 = new Draggable(this.mainx + (this.mainx/2), this.mainy + (this.mainy/2), 20, 20)
		this.shown = false;
	}

	draw(){
		this.shape1.mousedOver()
		this.shape1.update()
		this.shape1.draw()
		this.shape2.mousedOver()
		this.shape2.update()
		this.shape2.draw()

		fill(175, 200);
		stroke(225)
		line((this.shape1.x), (this.shape1.y), (this.shape2.x), (this.shape2.y));
		rect((this.shape1.x + this.shape2.x)/2,(this.shape1.y + this.shape2.y)/2-20, 50, 20)
		let dist = (parseInt(sqrt(pow(this.shape1.x - this.shape2.x,2)+pow(this.shape1.y - this.shape2.y,2))))
		fill(0)
		textSize(16)
		text(String(dist),(this.shape1.x + this.shape2.x)/2-15,(this.shape1.y + this.shape2.y)/2-15)
	}
}


let allObjects;
let isMouseBeingPressed = false;
let paused = false;
let canvas, ruler;

const getInitialObjects = () => ([
	new CircleMover({ loc: createVector(random(canvasWidth()), 0.25 * canvasHeight()) }),
	new CircleMover(),
	new BoxMover({ loc: createVector(random(canvasWidth()), 0.75 * canvasHeight()) }),
	// floor
	new BoxMover({ 
		loc: createVector(canvasWidth()/2, canvasHeight()), 
		width, 
		height: 10,
		hasGravity: false,
		mass: Infinity
	}),
	// ceiling
	new BoxMover({ 
		loc: createVector(canvasWidth()/2, 0), 
		width, 
		height: 10,
		hasGravity: false,
		mass: Infinity
	}),
	// left wall
	new BoxMover({ 
		loc: createVector(0, canvasHeight()/2), 
		height, 
		width: 10,
		hasGravity: false,
		mass: Infinity
	}),
	// right wall
	new BoxMover({ 
		loc: createVector(canvasWidth(), canvasHeight()/2), 
		height, 
		width: 10,
		hasGravity: false,
		mass: Infinity
	}),
])

function setup() {
	canvas = createCanvas(canvasWidthPixels(), canvasHeightPixels());
	// canvas.position(0, 0)
	
	// Move canvas into the #put-canvas-here element
	document.getElementById('put-canvas-here').appendChild(document.querySelector('.p5Canvas'))

	allObjects = getInitialObjects();

	ruler = new Ruler();

	//buttons allow for resets and pausing
	let b1;
	b1 = createButton('Pause');
 	b1.position(canvasWidthPixels()/50, canvasHeightPixels()/20);
 	b1.mousePressed(pause);

 	let b2;
	b2 = createButton('Restart');
 	b2.position(canvasWidthPixels()/50, canvasHeightPixels()/40);
 	b2.mousePressed(restart);

 	let b3;
	b3 = createButton('Ruler');
 	b3.position(canvasWidthPixels()/50, canvasHeightPixels()/13);
 	b3.mousePressed(toggleRuler);
}

//handles collisions between objects (but not walls)
function handleCollisions() {
	// loop through every pair of objects
	for (let index1 = 0; index1 < allObjects.length; index1++) {
		for (let index2 = index1 + 1; index2 < allObjects.length; index2++) {
			let object1 = allObjects[index1];
			let object2 = allObjects[index2];
			let manifold = getManifold(object1, object2);
			if (manifold /* are objects colliding? */) {
				positionalCorrection(manifold);
				manifold = getManifold(object1, object2);
				if (manifold) {
					resolveCollision(manifold);
				}
			}
		}
	}
}

//loops "constantly" to apply forces and have objects draw themselves
function draw() {

	background(0);

	//for each object in the array of them (m)
	allObjects.forEach(e => {
		if(!paused){ 
			if (e.hasGravity) {
				//apply a abitrary gravity 
				let gravity = createVector(0,0.3);
				//gravity not based on mass so multiply it so it will be divided out later
				gravity.mult(e.mass);
				e.applyForce(gravity);
			}

			//if mouse is pressed (see mousePressed and mouseReleased) apply wind
			// if(isMouseBeingPressed){
			// 	let wind = createVector(0.2,0);
			// 	e.applyForce(wind);	
			// }

			friction(e, -0.05);

			e.update();
		}
		e.show();
	});

	if(ruler.shown){
		ruler.draw()
	}

	handleCollisions();
}

/* Friction
	
	friction = -1 * M * ||N|| * vel (velocity unit vector)

	Direction of vector???
		= -1 * velocity unit vector

	Magnitude for Friction???
		= M (coefficient of friction) * ||N|| (magnitude of normal force)

	let velocity unit vector = 
		{
			let v = velocity.get()
			v.normalize()
		}

	let ||N|| (normal force) = 1 (ease and it doesn't really matter)

	let M (coefficient of friction) = 0.01 *example* (lots or little friction)

	friction = 
		{
			let friction = vel;
			friction.mult(M);
			friction.mult(||N||); (could remove as ||N|| = 1)
		}
	You can then apply friction with the applyForce function
*/
//mov is the mover object we want to apply friction to and c is the coefficient of friction
function friction(mov, c){
	let f = mov.getVel();
	f.normalize();
	f.mult(c);
	mov.applyForce(f);
}

function mousePressed() {
	ruler.shape1.pressed();
 	ruler.shape2.pressed();
}

function mouseReleased() {
	ruler.shape1.released();
	ruler.shape2.released();
}

function pause(){
	paused = !paused;
}

function restart(){
	paused = false;
	allObjects = getInitialObjects();
	ruler = new Ruler();
}

function toggleRuler(){
	ruler.shown = !ruler.shown;
}

function windowResized() {
	resizeCanvas(canvasWidthPixels(), canvasHeightPixels());
}
