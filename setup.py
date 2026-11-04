# Dev setup: restores the funded testnet payer wallet (seed read from files, never printed) and creates a merchant account.
import json,glob,os,urllib.request,sys
def q(query):
    r=urllib.request.Request('http://127.0.0.1:8000/graphql',json.dumps({'query':query}).encode(),{'content-type':'application/json'})
    return json.load(urllib.request.urlopen(r,timeout=60))
def rd(n):
    d=glob.glob(f'/home/sandbox/.vault/zcash-testnet-wallet-seed-part-{n}-*')[0]
    return open(os.path.join(d,'password')).read().strip()
seed=rd(1)+' '+rd(2)
print(q('mutation { createAccount(newAccount: { name: "payer", key: "%s", birth: 4582677, useInternal: true, aindex: 0 }) }'%seed))
print(q('mutation { createAccount(newAccount: { name: "merchant", key: "", useInternal: true, aindex: 0 }) }'))
for i in (1,2): print(i,q('{ addressByAccount(idAccount: %d) { ua } }'%i)['data']['addressByAccount']['ua'][:14])
print(q('mutation { synchronize(idAccounts: [1,2], fast: false) }'))
print(q('{ balanceByAccount(idAccount: 1) { ironwood sapling } }'))
