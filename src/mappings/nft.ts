import { Nft, Contract } from '../types/schema';
import { OwnershipTransferred, TransferSingle, Uri } from '../types/templates/OmnuumNFT1155/OmnuumNFT1155';
import { saveTransaction } from '../modules/transaction';
import { getContractTopic } from '../modules/topic';
import { EventName, getEventName } from '../modules/event';
import { updateMinterEntities } from '../modules/minter';
import { getLogMsg, logging, LogMsg } from '../utils/logger';

export function handleTransferSingle(event: TransferSingle): void {
  const nftContractAddress = event.address.toHexString();
  const tokenId = event.params.id.toString();
  const eventName = getEventName(EventName.TransferSingle);
  const transactionEntity = saveTransaction(event, getContractTopic(event.address), eventName);
  const mintQty = 1;

  // nftOwner can be minter or buyer after minting.
  const nftNewOwner = event.params.to.toHexString();

  const nftEntityId = `${nftContractAddress}_${tokenId}`;

  let nftEntity = Nft.load(nftEntityId);
  if (!nftEntity) {
    // Fresh minting
    // The mint quantity of minter, the mint quantity in the nft contract,
    // and the total minting supply of the nft contract are accumulated.
    updateMinterEntities(nftNewOwner, nftContractAddress, tokenId, mintQty, transactionEntity.block_number);

    const contractEntity = Contract.load(nftContractAddress);
    if (contractEntity) {
      contractEntity.max_supply = contractEntity.max_supply + mintQty;
    } else {
      logging(getLogMsg(LogMsg.___NO_ENTITY), eventName, nftContractAddress, '');
    }

    nftEntity = new Nft(nftEntityId);
    nftEntity.nft_contract = nftContractAddress;
    nftEntity.minter = nftNewOwner;
    nftEntity.owners = [nftNewOwner];
    nftEntity.token_id = tokenId;

    // update minter entities with adding mintQuantities and referencing nft Entity from minter
  } else {
    // A single transfer event for the same token ID in the same contract means that it was sold after minting.
    // Therefore, by sequentially adding the owner to the array, we index to track the owner of the corresponding token ID.
    const owners = nftEntity.owners;
    owners.push(nftNewOwner);
    nftEntity.owners = owners;
  }

  nftEntity.block_number = transactionEntity.block_number;
  nftEntity.transaction = transactionEntity.id;

  nftEntity.save();
}

export function handleOwnershipTransferred(event: OwnershipTransferred): void {
  const contractEntityId = event.address.toHexString();

  const contractEntity = Contract.load(contractEntityId);
  const eventName = getEventName(EventName.OwnershipTransferred);
  if (contractEntity) {
    if (contractEntity.owner === event.params.previousOwner.toHexString()) {
      const transactionEntity = saveTransaction(event, getContractTopic(event.address), eventName);
      contractEntity.block_number = transactionEntity.block_number;
      contractEntity.transaction = transactionEntity.id;
      contractEntity.owner = event.params.newOwner.toHexString();
      contractEntity.is_owner_changed = true;

      contractEntity.save();
    } else {
      logging(getLogMsg(LogMsg.___DIFF_OWNER), eventName, contractEntityId, '');
    }
  } else {
    logging(getLogMsg(LogMsg.___NO_ENTITY), eventName, contractEntityId, '');
  }
}

export function handleUri(event: Uri): void {
  const nftContractAddress = event.address.toHexString();
  const contractEntity = Contract.load(nftContractAddress);
  const eventName = getEventName(EventName.Uri);

  if (contractEntity) {
    const transactionEntity = saveTransaction(event, getContractTopic(event.address), eventName);
    contractEntity.block_number = transactionEntity.block_number;
    contractEntity.transaction = transactionEntity.id;
    contractEntity.is_revealed = true;
    contractEntity.reveal_url = event.params.uri;

    contractEntity.save();
  } else {
    logging(getLogMsg(LogMsg.___NO_ENTITY), eventName, nftContractAddress, '');
  }
}