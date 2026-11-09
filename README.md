# NuNu Vehicle Seats

Every square a vehicle token covers is a seat. Drop a character on one and it
rides there. Drag it off and it gets out.

Built for Foundry v12 and the `cyberpunk-red-core` system, alongside
[Cyberpunk RED Vehicles](https://github.com/sudo-sein/cyberpunk-red-vehicles).
No libWrapper, no socket, four hooks.

## Why it exists

Foundry has no notion of one token being inside another. A character dropped on
a car is a character overlapping a car: drive away and the character is left
standing in the road. The vehicles module records how many seats a vehicle has
and never records who is in them, so a crew of six splitting between a Turbo-R
and a Mackinaw has to be tracked by hand and remembered every time the vehicle
moves.

## What it does

**Getting in.** Move a token onto a vehicle and it takes the seat nearest where
it was dropped. The vehicle's whole footprint is seats, so a 2 by 4 car has
eight of them and a token can sit in any one. Which vehicle it boards is decided
by where the token's centre lands, not by what it overlaps, so a token across
two touching vehicles boards the one it is standing on.

**Two to a seat.** Nobody shares a square. A drop onto a taken seat slides to the
nearest free one rather than refusing the move, because losing a drag is worse
than sitting one square over. A vehicle with no free seat says so and the token
stays where it was put, outside.

**Carrying.** Whenever the vehicle moves, turns, or climbs, everyone aboard goes
with it, so passengers in a flying AV stay in it and a car that swings round
takes its crew round with it rather than spinning under them. The write is
pinned to `game.users.activeGM`, because every GM client sees the hook and only
one of them should be writing.

**Getting out.** Move the token off the vehicle. That is all.

**Tidying.** Deleting a vehicle puts its passengers back on their own feet rather
than leaving them pointed at a token that is gone, and a scene that loads holding
a ride whose vehicle no longer exists has it cleared once on load.

## What counts as a vehicle

Any actor of type `cyberpunk-red-vehicles.vehicle`, which is all 51 of them
without configuring anything.

Anything else can be made one by setting a flag on the token:

    token.document.setFlag("nunu-vehicle-seats", "isVehicle", true);

That is the escape hatch for a boat, a flatbed, a lift platform or a prop that
people are meant to stand on and that no actor type describes.

## What it stores

One flag on the passenger's token:

    flags["nunu-vehicle-seats"].ride = { vehicle: <token id>, ox: <px>, oy: <px> }

The offset is in pixels and in the **vehicle's own frame**: where the seat would
be if the vehicle were not turned. Everything else is derived from it, so one
stored pair of numbers survives the vehicle being driven, turned, or both at
once, and boarding a turned vehicle reads the drop point back into that same
frame rather than needing a second rule.

Pixels rather than a seat index because Foundry has already snapped the drop to
the grid, so an offset is a square anyway, and an unsnapped placement or a
half-grid vehicle still carries correctly instead of jumping to the nearest
square.

Nothing is written to the vehicle, so a vehicle can be deleted, re-imported or
replaced without leaving a record to clean up anywhere but on the passengers.

## What it does not do

**Grid truth under rotation.** Turning a vehicle rotates its artwork and not the
squares Foundry thinks it occupies. Passengers follow the artwork, which is what
anyone looking at the table expects, so a turned vehicle's crew can be standing
on squares the grid does not consider part of the vehicle. Seats, boarding and
occupancy are all worked out in the vehicle's own frame, so the module stays
consistent with itself; it is the grid that disagrees, and it disagrees about
the vehicle too.

**Passenger facing.** Passengers keep their own rotation. A top-down character
token turned on its side to match a car reads as a body on the floor.

**The rules.** Getting into a vehicle is an Action and changing seats is a Move
Action (CP:R p.192, and Hot Pursuit for the chase case). None of that is enforced
or counted here; this moves tokens and leaves the accounting to the table.

**Seat counts.** A Turbo-R has 2 seats and a footprint of 8 squares, and this
will happily seat 8. The footprint is the seating, as asked for, because the bed
of a truck, the roof of a van and the back of a flatbed are all places people
ride and none of them are seats.

## Tests

    node test/run.mjs

38 tests over the real `scripts/main.js`, loaded into a `vm` with the few Foundry
globals it touches mocked. Every one was checked by deliberately breaking the
module first and confirming the test caught it.

The carrying tests give the vehicle document its **old** position and put the
destination in `changes`, which is the shape Foundry hands the hook. A test where
the two agree passes against a module that reads the stale position, which is how
1.0.0 shipped with every passenger one move behind the car.
