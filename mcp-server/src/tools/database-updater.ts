/**
 * Database Updater Tool
 * Updates the state_regulations table with new/changed regulations
 */

import { SupabaseClient } from '@supabase/supabase-js';

export async function updateRegulationDatabase(
  supabase: SupabaseClient,
  regulations: any[],
  extractionMethod: string = 'mcp_scraper',
  createdBy: string = 'system'
): Promise<any> {
  const results = {
    created: 0,
    updated: 0,
    errors: 0,
    regulations_processed: regulations.length,
    details: [] as any[],
  };

  for (const reg of regulations) {
    try {
      // Check if regulation already exists
      const { data: existing } = await supabase
        .from('state_regulations')
        .select('id, rule_text, updated_at')
        .eq('state', reg.state)
        .eq('regulation_code', reg.regulation_code || '')
        .eq('category', reg.category)
        .single();

      const regulationData = {
        ...reg,
        extraction_method: extractionMethod,
        created_by: createdBy,
        last_verified_at: new Date().toISOString(),
        last_verified_by: createdBy,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        // Check if content changed
        if (existing.rule_text !== reg.rule_text) {
          // Update existing regulation
          const { error } = await supabase
            .from('state_regulations')
            .update(regulationData)
            .eq('id', existing.id);

          if (error) {
            results.errors++;
            results.details.push({
              regulation_code: reg.regulation_code,
              action: 'update_failed',
              error: error.message,
            });
          } else {
            results.updated++;
            results.details.push({
              regulation_id: existing.id,
              action: 'updated',
              changes: 'Content modified',
            });

            // Log change
            await supabase.from('regulation_changes').insert({
              regulation_id: existing.id,
              change_type: 'updated',
              field_changed: 'rule_text',
              old_value: existing.rule_text?.substring(0, 200),
              new_value: reg.rule_text?.substring(0, 200),
              detected_by: extractionMethod,
              change_summary: 'Regulation text updated via MCP',
            });
          }
        } else {
          // No changes, just update verification timestamp
          await supabase
            .from('state_regulations')
            .update({
              last_verified_at: new Date().toISOString(),
              last_verified_by: createdBy,
            })
            .eq('id', existing.id);

          results.details.push({
            regulation_id: existing.id,
            action: 'verified',
            changes: 'None - content unchanged',
          });
        }
      } else {
        // Create new regulation
        const { data, error } = await supabase
          .from('state_regulations')
          .insert(regulationData)
          .select()
          .single();

        if (error) {
          results.errors++;
          results.details.push({
            regulation_code: reg.regulation_code,
            action: 'create_failed',
            error: error.message,
          });
        } else {
          results.created++;
          results.details.push({
            regulation_id: data.id,
            action: 'created',
            regulation_code: reg.regulation_code,
          });

          // Log change
          await supabase.from('regulation_changes').insert({
            regulation_id: data.id,
            change_type: 'created',
            detected_by: extractionMethod,
            change_summary: `New regulation added: ${reg.rule_title}`,
          });
        }
      }
    } catch (error: any) {
      results.errors++;
      results.details.push({
        regulation_code: reg.regulation_code,
        action: 'error',
        error: error.message,
      });
    }
  }

  return results;
}
