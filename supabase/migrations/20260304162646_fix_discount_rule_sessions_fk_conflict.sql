alter table discount_rule_sessions
drop constraint fk_drs_session;

alter table discount_rule_sessions
drop constraint discount_rule_sessions_session_id_fkey;

alter table discount_rule_sessions
add constraint discount_rule_sessions_session_id_fkey
foreign key (session_id)
references class_sessions(id)
on delete cascade;