create OR REPLACE function bulk_update_stats(batting_stats update_batting_stats_input[],
                                             fielding_stats update_fielding_stats_input[],
                                             pitching_stats update_pitching_stats_input[])
    returns
        SETOF public.players
    strict
    language plpgsql
as
$$
BEGIN

    PERFORM upsert_type_into_table('update_batting_stats_input', 'player_id', 'career_batting', batting_stats);

    PERFORM upsert_type_into_table('update_fielding_stats_input', 'player_id', 'career_fielding', fielding_stats);

    PERFORM upsert_type_into_table('update_pitching_stats_input', 'player_id', 'career_pitching', pitching_stats);


    RETURN QUERY
        SELECT * from players WHERE id IN (SELECT player_id
                                                  FROM UNNEST(batting_stats)
                                                  UNION
                                                  SELECT player_id
                                                  FROM UNNEST(pitching_stats)
                                                  UNION
                                                  SELECT player_id
                                                  FROM UNNEST(fielding_stats));

END;
$$;


alter function bulk_update_stats(update_batting_stats_input[], update_fielding_stats_input[], update_pitching_stats_input[]) owner to postgres;

