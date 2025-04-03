
import mineflayer from "mineflayer";
import pathfinderPlugin from "mineflayer-pathfinder";
import { Vec3 } from "vec3";
const { pathfinder, Movements, goals } = pathfinderPlugin;
const { GoalBlock } = goals;
import dotenv from "dotenv";
import minecraftData from 'minecraft-data';

dotenv.config();
let mcData;

function createBot() {
  const bot = mineflayer.createBot({
    host: "dholakpur96-8MMk.aternos.me",
    port: 54647,
    username: "ChatGPT_Bot",
    version: "1.20.1",
    auth: 'offline',
    checkTimeoutInterval: 300000,
    closeTimeout: 240000,
    hideErrors: false,
    logErrors: true,
    keepAlive: true
  });

  bot.on('spawn', () => {
    console.log('Bot spawned successfully!');
    bot.chat("Hello! I'm online and ready to help.");
  });

  let reconnectAttempts = 0;
  const maxReconnectDelay = 300000; // 5 minutes

  function getReconnectDelay() {
    const delay = Math.min(30000 * Math.pow(2, reconnectAttempts), maxReconnectDelay);
    reconnectAttempts++;
    return delay;
  }

  bot.on('error', (err) => {
    console.log('Connection error:', err);
    const delay = getReconnectDelay();
    console.log(`Attempting to reconnect in ${delay/1000} seconds...`);
    setTimeout(createBot, delay);
  });

  bot.on('end', () => {
    console.log('Disconnected from server');
    const delay = getReconnectDelay();
    console.log(`Attempting to reconnect in ${delay/1000} seconds...`);
    setTimeout(createBot, delay);
  });

  bot.on('kicked', (reason, loggedIn) => {
    console.log('Bot was kicked:', reason);
    const delay = getReconnectDelay();
    console.log(`Attempting to reconnect in ${delay/1000} seconds...`);
    setTimeout(createBot, delay);
  });

  bot.loadPlugin(pathfinder);
  
  // Initialize mcData and movements after bot is ready
  bot.once('spawn', () => {
    mcData = minecraftData(bot.version);
    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);
  });
  
  return bot;
}

let bot = createBot();

// Command-based responses
bot.on("chat", async (username, message) => {
  if (username === bot.username) return;
  
  console.log(`${username}: ${message}`);
  message = message.toLowerCase();

  // Only respond to commands starting with !
  if (!message.startsWith('!')) return;

  const command = message.slice(1).split(' ')[0];
  const args = message.slice(1).split(' ').slice(1);

  const commands = {
    'help': () => {
      bot.chat(`Commands: !help, !collect <block>, !craft <item>, !fight, !explore, !break, !place, !drop, !goto <x> <y> <z>`);
    },
    'collect': async () => {
      const blockType = args[0];
      const amount = parseInt(args[1]) || 10;
      if (!blockType) return bot.chat('Specify a block type to collect');
      
      // Equip best tool for the job
      async function equipBestTool(block) {
        const items = bot.inventory.items();
        
        // Get the best tool based on block material
        let bestTool = null;
        let highestSpeed = 1;
        
        for (const item of items) {
          const tool = mcData.items[item.type];
          if (!tool) continue;
          
          if ((block.name.includes('stone') && tool.name.includes('pickaxe')) ||
              (block.name.includes('dirt') && tool.name.includes('shovel')) ||
              (block.name.includes('log') && tool.name.includes('axe'))) {
            bestTool = item;
            break;
          }
        }
        
        if (bestTool) {
          await bot.equip(bestTool, 'hand');
          return true;
        }
        return false;
      }
      
      bot.chat(`Searching for ${amount} ${blockType} blocks...`);
      let collected = 0;
      
      while (collected < amount) {
        const blocks = bot.findBlocks({
          matching: block => block.name.includes(blockType),
          maxDistance: 32,
          count: amount - collected
        });
        
        if (blocks.length === 0) {
          bot.chat(`Found and collected ${collected} ${blockType} blocks. No more found nearby.`);
          break;
        }
        
        for (const pos of blocks) {
          try {
            const block = bot.blockAt(pos);
            
            // Clear path to block if needed
            await bot.pathfinder.goto(new GoalBlock(pos.x, pos.y, pos.z));
            
            await bot.pathfinder.goto(new GoalBlock(pos.x, pos.y, pos.z));
            await equipBestTool(block);
            await bot.dig(block);
            collected++;
            
            if (collected % 5 === 0) {
              bot.chat(`Collected ${collected}/${amount} ${blockType} blocks`);
            }
          } catch (err) {
            console.log(`Error collecting block: ${err.message}`);
            continue;
          }
        }
      }
      
      bot.chat(`Finished collecting ${collected} ${blockType} blocks`);
    },
    'craft': async () => {
      const item = args[0];
      if (!item) return bot.chat('Specify an item to craft');
      
      const recipe = bot.recipesFor(item)[0];
      if (recipe) {
        try {
          await bot.craft(recipe, 1);
          bot.chat(`Crafted ${item}`);
        } catch (err) {
          bot.chat(`Cannot craft ${item}: missing materials`);
        }
      } else {
        bot.chat(`Don't know how to craft ${item}`);
      }
    },
    'fight': async () => {
      // Equip best weapon
      async function equipBestWeapon() {
        const items = bot.inventory.items();
        let bestWeapon = null;
        let highestDamage = 0;
        
        for (const item of items) {
          const weapon = mcData.items[item.type];
          if (!weapon) continue;
          
          if (weapon.name.includes('sword') || weapon.name.includes('axe')) {
            if (!bestWeapon || (weapon.name.includes('sword') && !bestWeapon.name.includes('sword'))) {
              bestWeapon = item;
            }
          }
        }
        
        if (bestWeapon) {
          await bot.equip(bestWeapon, 'hand');
          return true;
        }
        return false;
      }
      
      const entity = bot.nearestEntity(entity => {
        return (entity.type === 'player' && entity.username !== bot.username) || 
               (entity.type === 'hostile' || entity.type === 'mob');
      });
      
      if (entity) {
        await equipBestWeapon();
        bot.chat(`Engaging combat with ${entity.username || entity.type}`);
        bot.lookAt(entity.position);
        bot.attack(entity);
        
        const attackInterval = setInterval(async () => {
          if (!entity || !entity.isValid || entity.position.distanceTo(bot.entity.position) > 4) {
            clearInterval(attackInterval);
            bot.chat('Target lost or too far away');
            return;
          }
          await bot.lookAt(entity.position);
          await bot.attack(entity);
        }, 1000);
      } else {
        bot.chat('No valid targets nearby');
      }
    },
    'explore': () => {
      const x = Math.floor(Math.random() * 100) - 50;
      const z = Math.floor(Math.random() * 100) - 50;
      bot.chat('Exploring the area...');
      bot.pathfinder.setGoal(new GoalBlock(
        bot.entity.position.x + x,
        bot.entity.position.y,
        bot.entity.position.z + z
      ));
    },
    'break': async () => {
      try {
        // Check blocks in all directions
        const directions = [
          [0, -1, 0], // Below
          [0, 0, 1],  // North
          [0, 0, -1], // South
          [1, 0, 0],  // East
          [-1, 0, 0], // West
          [0, 1, 0],  // Above
        ];

        for (const [x, y, z] of directions) {
          const block = bot.blockAt(bot.entity.position.offset(x, y, z));
          if (block && block.name !== 'air') {
            // Move slightly away from block if too close
            if (bot.entity.position.distanceTo(block.position) < 2) {
              const moveVec = bot.entity.position.minus(block.position).normalize();
              await bot.pathfinder.goto(new GoalBlock(
                Math.floor(bot.entity.position.x + moveVec.x * 2),
                Math.floor(bot.entity.position.y),
                Math.floor(bot.entity.position.z + moveVec.z * 2)
              ));
            }
            
            bot.chat(`Breaking ${block.name}`);
            await bot.dig(block);
            return;
          }
        }
        bot.chat('No blocks found to break');
      } catch (err) {
        console.log("Block breaking error:", err);
        bot.chat('Failed to break block');
      }
    },
    'place': () => {
      const item = bot.inventory.items().find(item => item.name.includes('block'));
      if (item) {
        const referenceBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0));
        if (referenceBlock) {
          bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
          bot.chat('Placed block');
        }
      } else {
        bot.chat('No blocks in inventory');
      }
    },
    'goto': async () => {
      const x = parseInt(args[0]);
      const y = parseInt(args[1]);
      const z = parseInt(args[2]);
      
      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        bot.chat('Usage: !goto <x> <y> <z>');
        return;
      }

      bot.chat(`Moving to coordinates: ${x}, ${y}, ${z}`);
      
      try {
        // Configure movements for block placing and breaking
        const movements = new Movements(bot, mcData);
        movements.allowParkour = true;
        movements.allowSprinting = true;
        movements.canDig = true;
        movements.blocksToAvoid.delete(mcData.blocksByName.water.id);
        movements.scafoldingBlocks = [mcData.blocksByName.dirt.id, mcData.blocksByName.cobblestone.id];
        
        bot.pathfinder.setMovements(movements);
        
        // Set the goal
        const goal = new GoalBlock(x, y, z);
        await bot.pathfinder.goto(goal);
        
        bot.chat('Reached destination!');
      } catch (err) {
        bot.chat(`Failed to reach destination: ${err.message}`);
        console.log('Navigation error:', err);
      }
    },
    
    'drop': async () => {
      const items = bot.inventory.items();
      if (items.length === 0) {
        bot.chat('Inventory is empty');
        return;
      }
      
      bot.chat(`Dropping ${items.length} items...`);
      for (const item of items) {
        try {
          await bot.toss(item.type, null, item.count);
        } catch (err) {
          console.log(`Error dropping item ${item.name}:`, err);
        }
      }
      bot.chat('Dropped all items');
    }
  };

  const command_func = commands[command];
  if (command_func) {
    try {
      await command_func();
    } catch (err) {
      bot.chat(`Error executing command: ${err.message}`);
    }
  }
});

// Enhanced Combat & Survival System
bot.on("entityHurt", (entity) => {
  if (entity === bot.entity) {
    // We got hurt, identify attacker and respond
    const attacker = bot.nearestEntity(e => 
      (e.type === 'mob' || e.type === 'player') && 
      e.position.distanceTo(bot.entity.position) < 5
    );
    
    if (attacker) {
      const botHealth = bot.health;
      if (botHealth < 8) { // Low health, try to escape
        runFromEntity(attacker);
      } else { // Fight back
        fightEntity(attacker);
      }
    }
  }
});

// Periodically scan for hostile mobs
setInterval(() => {
  const hostile = bot.nearestEntity(e => 
    isHostileMob(e) && 
    e.position.distanceTo(bot.entity.position) < 16
  );
  
  if (hostile) {
    if (bot.health < 8) {
      runFromEntity(hostile);
    } else {
      fightEntity(hostile);
    }
  }
}, 1000);

function isHostileMob(entity) {
  if (!entity) return false;
  const hostileTypes = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman'];
  return hostileTypes.some(type => entity.name?.toLowerCase().includes(type));
}

async function fightEntity(entity) {
  if (!entity || !entity.isValid) return;
  
  try {
    // Equip best weapon if available
    const weapons = bot.inventory.items().filter(item => 
      item.name.toLowerCase().includes('sword') || 
      item.name.toLowerCase().includes('axe')
    );
    if (weapons.length > 0) {
      await bot.equip(weapons[0], 'hand');
    }
    
    // Attack pattern
    bot.lookAt(entity.position.offset(0, entity.height * 0.5, 0));
    bot.attack(entity);
    
    // Strafe around target
    const direction = Math.random() > 0.5 ? 1 : -1;
    bot.setControlState('left', direction > 0);
    bot.setControlState('right', direction < 0);
    
    setTimeout(() => {
      bot.setControlState('left', false);
      bot.setControlState('right', false);
    }, 500);
  } catch (err) {
    console.log("Combat error:", err);
  }
}

async function runFromEntity(entity) {
  if (!entity || !entity.isValid) return;
  
  try {
    // Calculate escape vector (opposite direction from threat)
    const vec = bot.entity.position.minus(entity.position).normalize();
    const goal = new GoalBlock(
      Math.floor(bot.entity.position.x + vec.x * 10),
      Math.floor(bot.entity.position.y),
      Math.floor(bot.entity.position.z + vec.z * 10)
    );
    
    // Sprint away
    bot.setControlState('sprint', true);
    await bot.pathfinder.goto(goal);
    bot.setControlState('sprint', false);
  } catch (err) {
    console.log("Escape error:", err);
  }
}

// Block interactions
bot.on("chat", (username, message) => {
  if (message === "break") {
    try {
      const targetBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0));
      if (targetBlock) bot.dig(targetBlock);
    } catch (err) {
      console.log("Block breaking error:", err);
    }
  }
  
  if (message === "place") {
    try {
      const item = bot.inventory.items().find(item => item.name.includes("block"));
      if (item) {
        const referenceBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0));
        if (referenceBlock) {
          bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
        }
      }
    } catch (err) {
      console.log("Block placing error:", err);
    }
  }
});

// Exploration
bot.on("chat", (username, message) => {
  if (message === "explore") {
    try {
      const x = Math.floor(Math.random() * 100) - 50;
      const z = Math.floor(Math.random() * 100) - 50;
      const goal = new GoalBlock(
        bot.entity.position.x + x,
        bot.entity.position.y,
        bot.entity.position.z + z
      );
      bot.pathfinder.setGoal(goal);
    } catch (err) {
      console.log("Exploration error:", err);
    }
  }
});
