"""keystone-comms MCP server (stdio, stdlib only): the agent's gated way to reach people.

ping_user, send_dm and post_to_channel never send anything. Each creates a proposed action in Keystone; the person the
agent acts for approves it on the Agent actions page (or on their linked phone), and only then does the executor
deliver it. Targets outside what that person may reach are refused. Same sign-in as keystone_mcp.py:

  {"mcpServers": {"keystone-comms": {"command": "python", "args": ["<repo>/mcp/keystone_comms.py"],
                                     "env": {"KEYSTONE_EMPLOYEE_ID": "NL-003", "KEYSTONE_PASSWORD": "..."}}}}
"""
from keystone_mcp import call, main, schema

GATED = ' Creates a PROPOSAL only: a person must approve it in Keystone before anything is sent.'


def propose(tool, **payload):
    return call('POST', '/actions', {'tool': tool, 'payload': {k: v for k, v in payload.items() if v}})


TOOLS = {
    'list_people': ('People in your organisation (user_id, name, designation, team) to address messages to.',
                    schema(), lambda a: call('GET', '/people')),
    'list_channels': ('Channels you can read and post in (id, name, type).', schema(),
                      lambda a: call('GET', '/channels')),
    'ping_user': ('Notify one person about a Keystone item, with a short reason.' + GATED,
                  schema([('user_id', 'from list_people'), ('reason', 'one or two sentences')],
                         ref_id='a Keystone item the ping is about, e.g. DEC-007'),
                  lambda a: propose('ping_user', user_id=a['user_id'], reason=a['reason'], ref_id=a.get('ref_id'))),
    'send_dm': ('Send a direct message to one person on your behalf.' + GATED,
                schema([('user_id', 'from list_people'), ('body', 'the message')]),
                lambda a: propose('send_dm', user_id=a['user_id'], body=a['body'])),
    'post_to_channel': ('Post a message to a channel you belong to.' + GATED,
                        schema([('channel_id', 'from list_channels'), ('body', 'the message')]),
                        lambda a: propose('post_to_channel', channel_id=a['channel_id'], body=a['body'])),
}

if __name__ == '__main__':
    main('keystone-comms', TOOLS)
