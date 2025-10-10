// Script to check existing players and add some if needed
import { runWithPublicClient, PublicSchema } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';

async function checkAndAddPlayers() {
  console.log('🧪 Checking existing players...');
  
  try {
    await runWithPublicClient(getDbOptions(), async (db) => {
      // Check existing players
      const existingPlayers = await db.select()
        .from(PublicSchema.players)
        .limit(10);

      console.log(`📋 Found ${existingPlayers.length} existing players:`);
      existingPlayers.forEach(player => {
        console.log(`  - Player ${player.id}: ${player.firstName} ${player.lastName} (${player.brefId})`);
      });

      if (existingPlayers.length === 0) {
        console.log('➕ Adding sample players...');
        const samplePlayers = [
          { firstName: 'John', lastName: 'Doe', brefId: 'doej01' },
          { firstName: 'Jane', lastName: 'Smith', brefId: 'smithj01' },
          { firstName: 'Mike', lastName: 'Johnson', brefId: 'johnsonm01' },
          { firstName: 'Sarah', lastName: 'Williams', brefId: 'williamss01' },
          { firstName: 'David', lastName: 'Brown', brefId: 'brownd01' },
        ];

        await db.insert(PublicSchema.players)
          .values(samplePlayers);
        
        console.log(`✅ Added ${samplePlayers.length} sample players`);
        
        // Now get the newly created players
        const newPlayers = await db.select()
          .from(PublicSchema.players)
          .limit(10);
        
        console.log('🎯 Available players for team members:');
        newPlayers.forEach(player => {
          console.log(`  - Player ${player.id}: ${player.firstName} ${player.lastName}`);
        });
      }
    });
  } catch (error) {
    console.error('❌ Error with players:', error);
  }
}

checkAndAddPlayers();
