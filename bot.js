import mineflayer from "mineflayer";
import pathfinderPlugin from "mineflayer-pathfinder";
import { Vec3 } from "vec3";
import pvpPlugin from "mineflayer-pvp";
import dotenv from "dotenv";
import fetch from "node-fetch";

const { pathfinder, Movements, goals } = pathfinderPlugin;
const { GoalBlock, GoalFollow, GoalNear } = goals;
const { pvp } = pvpPlugin;

dotenv.config();

const bot = mineflayer.createBot({
  host: "dholakpur96-8MMk.aternos.me",
  port: 54647,
  username: "ChatGPT_Bot",
});

// Load plugins
bot.loadPlugin(pathfinder);
bot.loadPlugin(pvp);

// Enhanced Combat Variables
let isInCombat = false;
let lastDodgeTime = 0;
let combatTarget = null;

async function equipBestWeapon() {
  const weapons = [
    'netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword'
  ];

  for (const weapon of weapons) {
    const item = bot.inventory.items().find(i => i.name.includes(weapon));
    if (item) {
      await bot.equip(item, 'hand');
      return true;
    }
  }
  bot.chat('No weapon found!');
  return false;
}

// Anti-stuck mechanism
bot.on('physicsTick', () => {
  if (bot.pathfinder.isMoving()) {
    const velocity = Math.sqrt(
      bot.entity.velocity.x**2 + 
      bot.entity.velocity.z**2
    );
    if (velocity < 0.01) {
      bot.pathfinder.setGoal(null);
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 1000);
    }
  }
});

// Improved Spawn Setup with IRON GEAR
bot.on("spawn", () => {
  const defaultMove = new Movements(bot);
  defaultMove.canSwim = false;
  bot.pathfinder.setMovements(defaultMove);

  // Iron gear with enchants
  bot.chat("/give @s iron_sword{Unbreakable:1,Enchantments:[{id:sharpness,lvl:5}]}");
  bot.chat("/give @s iron_chestplate{Unbreakable:1,Enchantments:[{id:protection,lvl:4}]}");
  bot.chat("/give @s iron_leggings{Unbreakable:1}");
  bot.chat("/give @s iron_boots{Unbreakable:1}");
  bot.chat("/give @s cooked_beef 64");
  bot.chat("/give @s shield{Unbreakable:1}"); // Added shield for defense
});

// Enhanced Combat System
let combatInterval;
let currentTarget = null;

bot.on('chat', (username, message) => {
  if (message === 'kill golems') {
    const golem = bot.nearestEntity(e => 
      e.name === 'iron_golem' && 
      e.position.distanceTo(bot.entity.position) < 16
    );

    if (!golem) {
      bot.chat('No iron golems nearby!');
      return;
    }

    currentTarget = golem;
    bot.chat(`Attacking iron golem at ${golem.position.floored()}`);
    startCombat();
  }
});

function startCombat() {
  // Clear any existing combat loop
  if (combatInterval) clearInterval(combatInterval);

  combatInterval = setInterval(() => {
    if (!currentTarget?.isValid) {
      bot.chat('Target lost!');
      clearInterval(combatInterval);
      return;
    }

    const distance = bot.entity.position.distanceTo(currentTarget.position);

    // Combat Logic
    if (distance < 3.5) {
      // Attack sequence
      equipBestWeapon();
      bot.pvp.attack(currentTarget);

      // Dodging
      if (Math.random() > 0.7) {
        const dodgeX = Math.random() > 0.5 ? 2 : -2;
        const dodgeZ = Math.random() > 0.5 ? 2 : -2;
        bot.setControlState('sprint', true);
        bot.pathfinder.setGoal(
          new GoalNear(
            bot.entity.position.x + dodgeX,
            bot.entity.position.y,
            bot.entity.position.z + dodgeZ,
            1
          )
        );
        setTimeout(() => bot.setControlState('sprint', false), 1000);
      }
    } else {
      // Close distance
      bot.pathfinder.setGoal(new GoalFollow(currentTarget, 2));
    }
  }, 500); // Checks every 500ms
}
async function combatLoop() {
  if (!isInCombat || !combatTarget?.isValid) {
    isInCombat = false;
    bot.chat("Combat ended");
    return;
  }

  const { position } = bot.entity;
  const golemPos = combatTarget.position;

  // Combat Tactics
  if (position.distanceTo(golemPos) < 3) {
    // Dodge mechanic
    if (Date.now() - lastDodgeTime > 2000) {
      await dodgeAttack();
      lastDodgeTime = Date.now();
    } else {
      // Use shield if available
      const shield = bot.inventory.items().find(i => i.name === "shield");
      if (shield) await bot.equip(shield, "off-hand");

      // Build defensive tower
      await buildTower();
    }
  } else if (position.distanceTo(golemPos) > 4) {
    // Close distance
    bot.pathfinder.setGoal(new GoalNear(golemPos.x, golemPos.y, golemPos.z, 2));
  }

  // Attack sequence
  if (position.distanceTo(golemPos) < 5) {
    await equipBestWeapon();
    bot.pvp.attack(combatTarget);
  }

  // Continue combat loop
  setTimeout(combatLoop, 500);
}

async function dodgeAttack() {
  const directions = [
    new Vec3(1, 0, 0),
    new Vec3(-1, 0, 0),
    new Vec3(0, 0, 1),
    new Vec3(0, 0, -1)
  ];

  const randomDir = directions[Math.floor(Math.random() * directions.length)];
  const dodgePos = bot.entity.position.plus(randomDir.scale(3));

  bot.chat("Dodging attack!");
  bot.setControlState("sprint", true);
  bot.pathfinder.setGoal(new GoalBlock(dodgePos.x, dodgePos.y, dodgePos.z));
  await bot.waitForTicks(10);
  bot.setControlState("sprint", false);
}

async function buildTower() {
  bot.chat("Building defensive tower!");
  const block = bot.inventory.items().find(i => i.name.includes("cobblestone")) || 
               bot.inventory.items().find(i => i.name.includes("dirt"));

  if (block) {
    await bot.equip(block, "hand");

    // Place 3 blocks under itself
    for (let i = 0; i < 3; i++) {
      const placePos = bot.entity.position.minus(new Vec3(0, i + 1, 0));
      const referenceBlock = bot.blockAt(placePos.plus(new Vec3(0, 1, 0)));

      if (referenceBlock?.name !== "air") {
        await bot.placeBlock(referenceBlock, new Vec3(0, -1, 0));
        await bot.waitForTicks(5);
      }
    }

    // Jump down after attack
    setTimeout(() => {
      bot.setControlState("jump", true);
      setTimeout(() => bot.setControlState("jump", false), 500);
    }, 1500);
  }
}

async function equipBestWeapon() {
  const ironSword = bot.inventory.items().find(i => i.name === "iron_sword");
  if (ironSword) {
    await bot.equip(ironSword, "hand");
    return;
  }

  const anySword = bot.inventory.items().find(i => i.name.includes("sword"));
  if (anySword) await bot.equip(anySword, "hand");
}

// Health Management
bot.on("health", () => {
  if (bot.health < 10 && !bot.inventory.items().some(i => i.name.includes("beef"))) {
    bot.chat("/give @s cooked_beef 16");
  }

  if (bot.health < 5) {
    bot.chat("Health critical! Retreating!");
    isInCombat = false;
    const retreatPos = bot.entity.position.plus(new Vec3(-5, 0, -5));
    bot.pathfinder.setGoal(new GoalBlock(retreatPos.x, retreatPos.y, retreatPos.z));
  }
});

// Keep all existing event handlers below
// (Original chat commands, physicsTick, etc. remain unchanged)
bot.on("chat", async (username, message) => {
  if (username === bot.username) return;

  console.log(`${username}: ${message}`);

  try {
    const response = await fetch(
      "https://api.forefront.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.FOREFRONT_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: message }],
        }),
      },
    );
    const data = await response.json();
    const reply = data.choices[0].message.content;
    bot.chat(reply);
  } catch (error) {
    console.error("Error fetching Forefront AI response:", error);
  }
});

// Auto-reconnect on disconnect
bot.on("end", () => {
  console.log("Disconnected. Reconnecting...");
  setTimeout(() => process.exit(1), 5000);
});

// Prevent Drowning
bot.on("physicsTick", () => {
  const blockBelow = bot.blockAt(bot.entity.position.offset(0, -1, 0));
  if (blockBelow && blockBelow.name.includes("water")) {
    console.log("Bot is in water! Trying to escape...");
    bot.setControlState("jump", true);
    const solidBlock = bot.inventory.items().find(
      (item) => item.name.includes("dirt") || item.name.includes("stone"),
    );
    if (solidBlock) {
      bot.equip(solidBlock, "hand", () => {
        bot.placeBlock(blockBelow, new Vec3(0, 1, 0));
      });
    }
  }
});

// Follow Player Command
let followTarget = null;
bot.on("chat", (username, message) => {
  if (message.startsWith("!follow")) {
    followTarget = bot.players[username]?.entity;
    if (!followTarget) {
      bot.chat("I can't see you!");
      return;
    }
    bot.chat(`Following ${username}...`);
    bot.pathfinder.setGoal(new GoalFollow(followTarget, 1), true);
  } else if (message.startsWith("!stop")) {
    followTarget = null;
    bot.pathfinder.setGoal(null);
    bot.chat("Stopped following.");
  }
});

// Auto Follow Continuously
bot.on("physicsTick", () => {
  if (followTarget && followTarget.isValid) {
    bot.pathfinder.setGoal(new GoalFollow(followTarget, 1), true);
  }
});

// Existing tool give commands
bot.on("chat", (username, message) => {
  const items = {
    "give pickaxe": "iron_pickaxe",
    "give axe": "iron_axe",
    "give sword": "iron_sword",
    "give shovel": "iron_shovel",
    "give hoe": "iron_hoe",
  };

  if (items[message]) {
    bot.chat(`/give ${username} ${items[message]}{Unbreakable:1}`);
  }
});
bot.on('chat', async (username, message) => {
  if (message.startsWith('!fill')) {
    const args = message.split(' ');
    if (args.length < 4) {
      bot.chat('Usage: !fill x y z');
      return;
    }

    const centerX = parseInt(args[1]);
    const centerY = parseInt(args[2]);
    const centerZ = parseInt(args[3]);

    bot.chat(`Filling area around ${centerX} ${centerY} ${centerZ}...`);

    // Get blocks (prioritize cobblestone, then dirt)
    let blockToPlace = bot.inventory.items().find(i => i.name.includes('cobblestone')) || 
                     bot.inventory.items().find(i => i.name.includes('dirt'));

    if (!blockToPlace) {
      bot.chat('No building blocks in inventory!');
      return;
    }

    await bot.equip(blockToPlace, 'hand');

    // Fill 5x5 area
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        const targetPos = new Vec3(centerX + x, centerY, centerZ + z);
        const blockBelow = bot.blockAt(targetPos.offset(0, -1, 0));

        if (blockBelow && blockBelow.name !== 'air') {
          await bot.placeBlock(blockBelow, new Vec3(0, 1, 0));
          await bot.waitForTicks(2); // Small delay to prevent server kick
        }
      }
    }
    bot.chat('Finished filling area!');
  }
});

// All other existing handlers remain below...
// (Keep your !fight, !fill, biome finding, etc. exactly as they were)