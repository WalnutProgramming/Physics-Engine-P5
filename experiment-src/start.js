import {
	canvasHeight,
	canvasWidth,
	ctx,
	recordMousePos,
	canvasScope,
	getMousePos,
	canvas,
} from "./canvas.js";
import { distToPixels, coordToPixels } from "./coordTransforms.js";
import { Ruler } from "./objects.js";
import Vector from "./vector.js";
import {
	getManifold,
	positionalCorrection,
	resolveCollision,
} from "./collisions.js";
import { createHashUrl, getSerializedUrl, serialize } from "./serialization.js";
import { cloneDeep } from "https://cdn.skypack.dev/pin/lodash-es@v4.17.20-OGqVe1PSWaO3mr3KWqgK/min/lodash-es.js";

const DEBUG_DONT_PREGENERATE = false;

// 60 frames per second
const fps = 60;

export default function start({
	getInitialState,
	getSelectedIds = () => [],
	onObjectSelected = () => {},
	editInitialState = () => {},
	isCreating = false,
	isPreview = false,
}) {
	let userState = {
		paused: false,
		ruler: new Ruler(),
	};
	function updatePlayPauseButton() {
		if (isPreview) return;
		const correctId = userState.paused ? "play" : "pause";
		const otherId = userState.paused ? "pause" : "play";
		document.getElementById(correctId).style.display = "flex";
		document.getElementById(otherId).style.display = "none";
	}
	updatePlayPauseButton();

	//handles collisions between objects (but not walls)
	function handleCollisions(state) {
		const { allObjects } = state;
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

	function handleGravitation(state) {
		const { allObjects } = state;
		// loop through every pair of objects
		for (let index1 = 0; index1 < allObjects.length; index1++) {
			for (let index2 = index1 + 1; index2 < allObjects.length; index2++) {
				let object1 = allObjects[index1];
				let object2 = allObjects[index2];
				const mass1 = object1.mass;
				const mass2 = object2.mass;

				if (!(isFinite(mass1) && isFinite(mass2))) continue;

				const positionDifference = object2.loc.subt(object1.loc);
				const r = positionDifference.magnitude();
				const forceDirection = positionDifference.normalize();
				
				let gravityMagnitude = state.universalGravitationalConstant * mass1 * mass2 / r ** 2
				gravityMagnitude = Math.min(gravityMagnitude, 1);
				const gravity = forceDirection.mult(gravityMagnitude);

				object1.applyForce(gravity);
				object2.applyForce(gravity.mult(-1));
			}
		}
	}

	function update(state) {
		//for each object in the array of them
		state.allObjects.forEach((e) => {
			if (state.hasPlanetGravity && e.hasGravity) {
				//apply a abitrary gravity
				let gravity = new Vector(0, state.planetGravity);
				//gravity not based on mass so multiply it so it will be divided out later
				gravity = gravity.mult(e.mass);
				e.applyForce(gravity);
			}

			//if mouse is pressed (see mousePressed and mouseReleased) apply wind
			// if(isMouseBeingPressed){
			// 	let wind = new Vector(0.2,0);
			// 	e.applyForce(wind);
			// }

			if (state.hasAirResistance) {
				friction(e, state.dragCoefficient);
			}

			e.update();
		});

		if (state.hasUniversalGravitation) {
			handleGravitation(state);
		}

		handleCollisions(state);
	}

	//function to ease creation of arrows in the draw state for selected item's vectors
	function canvas_arrow(ctx, fromx, fromy, tox, toy) {
	  let headlen = 20; // length of head in pixels
	  let dx = tox - fromx;
	  let dy = toy - fromy;
	  let angle = Math.atan2(dy, dx);
	  let endpointone = {x:tox - headlen * Math.cos(angle - Math.PI / 6), y:toy - headlen * Math.sin(angle - Math.PI / 6)}
	  let endpointtwo = {x:tox - headlen * Math.cos(angle + Math.PI / 6), y:toy - headlen * Math.sin(angle + Math.PI / 6)}
	  ctx.moveTo(fromx, fromy);
	  ctx.lineTo(tox,toy);
	  ctx.moveTo(endpointone.x,endpointone.y);
	  ctx.lineTo(tox,toy);
	  ctx.lineTo(endpointtwo.x,endpointtwo.y);
	  ctx.lineTo(tox, toy);
	  ctx.fillStyle = "red"
	  ctx.fill();
	}

	//loops "constantly" to apply forces and have objects draw themselves
	function draw(state) {
		canvasScope(() => {
			ctx.fillRect(
				0,
				0,
				distToPixels(canvasWidth()),
				distToPixels(canvasHeight())
			);

			if (isPreview) {
				canvasScope(() => {
					ctx.font = "30px Comfortaa";
					ctx.fillStyle = "white";
					ctx.textAlign = "center";
					ctx.fillText("Click to edit!", canvas.width / 2, canvas.height / 3);
				})
			}

			const selectedIds = getSelectedIds();
			state.allObjects.forEach((object) => {
				canvasScope(() => {
					object.draw(selectedIds.includes(object.id));
					if (object.vel.magnitude() > 0.5) {
						ctx.beginPath()
						let pos = coordToPixels(object.loc)
						let velo = coordToPixels(object.vel)
						canvas_arrow(ctx,pos.x,pos.y,(pos.x+velo.x*13),(pos.y+velo.y*13))
						ctx.strokeStyle = '#ff0000'
						ctx.stroke()
					}
				});
			});

			if (userState.ruler.shown) {
				canvasScope(() => {
					userState.ruler.draw();
				});
			}
		});
	}

	let states;
	let stateInd;

	function generateNextState() {
		const lastState = cloneDeep(states[states.length - 1]);
		update(lastState);
		states.push(lastState);
	}
	function resetAndRandomizeStates(shouldUnpause = true) {
		stateInd = 0;
		if (shouldUnpause) {
			userState.paused = false;
			updatePlayPauseButton();
		}
		states = [getInitialState()];

		if (!(isCreating && userState.paused)) {
			// precalculate states
			const startTime = Date.now();
			const maxFramesToPrecalculate = isCreating ? 2 * fps : 30 * fps;
			const maxTimeToPrecalculate = isCreating ? 14 : 100;
			while (
				states.length < maxFramesToPrecalculate &&
				Date.now() - startTime < maxTimeToPrecalculate
			) {
				if (!DEBUG_DONT_PREGENERATE) generateNextState();
			}
		}
	}
	window.restart = resetAndRandomizeStates;
	resetAndRandomizeStates();
	if (!isPreview) document.getElementById("loading-experiment").innerHTML = "";

	let maxFrameReached = 1;
	function sliderFrameLength() {
		const interval = 30 * fps;
		return Math.ceil((maxFrameReached + 1 * fps) / interval) * interval;
	}

	let showTime = () => {};
	if (!isPreview) {
		const timeSlider = document.getElementById("time-slider");
		timeSlider.value = 0;
		showTime = () => {
			const seconds = stateInd / 60;
			const secondsFloored = Math.floor(seconds);
			const secondsFlooredStr = secondsFloored.toString().padStart(3, "0");
			const milliseconds = Math.floor((seconds % 1) * 1000);
			const millisecondsStr = milliseconds.toString().padStart(3, "0");
			document.getElementById(
				"time"
			).innerText = `${secondsFlooredStr}.${millisecondsStr}`;

			timeSlider.value = stateInd / sliderFrameLength();
		}
		timeSlider.addEventListener("input", () => {
			stateInd = Math.floor(timeSlider.value * sliderFrameLength());
			showTime();
		});

		document.getElementById("copy-link").addEventListener("click", async () => {
			const copyLinkToolTip = document.getElementById("copy-link-tooltip");
			const state = states[0];
			let url;
			copyLinkToolTip.textContent = "Generating URL...";
	
			try {
				const res = await fetch(`/.netlify/functions/experiment-url`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: `{"state":${serialize(state)}}`,
				});
				const { id } = await res.json();
				url = createHashUrl(id);
			} catch (e) {
				console.warn("failed to ask server for url; generating long url ", e);
				url = getSerializedUrl(state);
			}
	
			try {
				navigator.clipboard.writeText(url);
			} catch (e) {
				console.error("failed to copy to clipboard: ", e);
				copyLinkToolTip.textContent =
					"Failed to copy. Here is the URL for you to copy manually: " + url;
				return;
			}
	
			copyLinkToolTip.textContent = "Copied!";
			setTimeout(() => {
				copyLinkToolTip.textContent = "";
			}, 2000);
		});
	
		window.addEventListener("hashchange", () => {
			location.reload();
		});
	}

	setInterval(() => {
		maxFrameReached = Math.max(maxFrameReached, stateInd);
		if (DEBUG_DONT_PREGENERATE) {
			generateNextState();
		} else {
			if (states.length - stateInd < 10 * fps) {
				for (let i = 0; i < 3; i++) generateNextState();
			}
			while (states.length - stateInd < 0.2 * fps) {
				generateNextState();
			}
		}
		if (!userState.paused) {
			stateInd++;
		}
		showTime();

		window.isFinishedLoading = true;
		if (window.NProgress) window.NProgress.done();

		draw(states[stateInd]);
	}, 1000 / 60);

	// draw();

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
	function friction(mov, c) {
		const f = mov.vel.normalize().mult(c);
		mov.applyForce(f);
	}

	let draggedObjectId = null;
	let lastMousePos;

	function shouldAllowDraggingPhysicsObjects() {
		return isCreating && userState.paused && stateInd === 0 && states.length > 0;
	}

	function getObjectUnderMouse() {
		if (stateInd >= states.length) return;
		const mousePos = getMousePos();
		for (const object of states[stateInd].allObjects) {
			if (object.containsPoint(mousePos)) {
				return object;
			}
		}
	}

	function selectObjectUnderMouse() {
		const object = getObjectUnderMouse();
		if (object) onObjectSelected(object.id);
	}

	canvas.addEventListener("mousedown", (e) => {
		recordMousePos(e);
		userState.ruler.shape1.pressed();
		userState.ruler.shape2.pressed();

		selectObjectUnderMouse();

		if (!shouldAllowDraggingPhysicsObjects()) {
			draggedObjectId = null;
			return;
		}
		const object = getObjectUnderMouse();
		if (!object) return;
		draggedObjectId = object.id;
		lastMousePos = getMousePos();
	});

	canvas.addEventListener("mousemove", (e) => {
		if (!shouldAllowDraggingPhysicsObjects()) {
			draggedObjectId = null;
		}
		if (!draggedObjectId) return;
		const obj = states[stateInd].allObjects.find(({ id }) => id === draggedObjectId);
		if (!obj) return;
		obj.loc = obj.loc.add(getMousePos().subt(lastMousePos));
		editInitialState(states[stateInd]);
		lastMousePos = getMousePos();
	})

	canvas.addEventListener("mouseup", (e) => {
		recordMousePos(e);
		userState.ruler.shape1.released();
		userState.ruler.shape2.released();
		draggedObjectId = null;
	});

	canvas.addEventListener("mouseout", () => {
		draggedObjectId = null;
	})

	canvas.addEventListener("mousemove", (e) => {
		recordMousePos(e);
	});

	window.pause = () => {
		userState.paused = !userState.paused;
		updatePlayPauseButton();
	};

	window.toggleRuler = () => {
		userState.ruler.shown = !userState.ruler.shown;
	};

	window.editExperiment = () => {
		userState.paused = true;
		updatePlayPauseButton();
		stateInd = 0;
	}
}
